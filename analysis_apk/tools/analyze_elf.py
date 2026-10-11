#!/usr/bin/env python3
"""Small, repeatable ELF/AArch64 inspection helper for libasgame.so."""

from __future__ import annotations

import argparse
import bisect
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "pydeps"))

from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN  # type: ignore
from capstone.arm64 import ARM64_OP_IMM, ARM64_OP_REG  # type: ignore
from elftools.elf.elffile import ELFFile  # type: ignore


def load_symbols(elf: ELFFile) -> list[dict]:
    result: dict[tuple[int, str], dict] = {}
    for section_name in (".symtab", ".dynsym"):
        section = elf.get_section_by_name(section_name)
        if section is None:
            continue
        for symbol in section.iter_symbols():
            name = symbol.name
            value = int(symbol["st_value"])
            if not name or not value:
                continue
            key = (value, name)
            result[key] = {
                "name": name,
                "value": value,
                "size": int(symbol["st_size"]),
                "type": symbol["st_info"]["type"],
            }
    return sorted(result.values(), key=lambda item: (item["value"], item["name"]))


def va_to_offset(elf: ELFFile, address: int) -> int | None:
    for segment in elf.iter_segments():
        if segment["p_type"] != "PT_LOAD":
            continue
        start = int(segment["p_vaddr"])
        size = int(segment["p_filesz"])
        if start <= address < start + size:
            return int(segment["p_offset"]) + address - start
    return None


def printable_at(blob: bytes, elf: ELFFile, address: int, limit: int = 180) -> str | None:
    offset = va_to_offset(elf, address)
    if offset is None or offset >= len(blob):
        return None
    end = blob.find(b"\0", offset, min(len(blob), offset + limit))
    if end < 0:
        return None
    value = blob[offset:end]
    if len(value) < 4:
        return None
    try:
        text = value.decode("utf-8")
    except UnicodeDecodeError:
        return None
    if not all(ch.isprintable() or ch in "\t\r\n" for ch in text):
        return None
    return text.replace("\r", "\\r").replace("\n", "\\n")


def nearest_symbol(symbols: list[dict], starts: list[int], address: int) -> str | None:
    pos = bisect.bisect_right(starts, address) - 1
    if pos < 0:
        return None
    symbol = symbols[pos]
    delta = address - symbol["value"]
    size = symbol["size"]
    if delta == 0:
        return symbol["name"]
    if size and delta < size:
        return f"{symbol['name']}+0x{delta:x}"
    return None


def load_plt_symbols(elf: ELFFile) -> dict[int, str]:
    """Map AArch64 PLT stub addresses to their relocation symbol names."""
    plt = elf.get_section_by_name(".plt")
    relocations = elf.get_section_by_name(".rela.plt")
    if plt is None or relocations is None:
        return {}
    symbol_table = elf.get_section(relocations["sh_link"])
    if symbol_table is None:
        return {}
    # The AArch64 PLT has a 32-byte resolver header and 16-byte entries.
    first = int(plt["sh_addr"]) + 32
    result: dict[int, str] = {}
    for index, relocation in enumerate(relocations.iter_relocations()):
        symbol_index = int(relocation["r_info_sym"])
        result[first + index * 16] = symbol_table.get_symbol(symbol_index).name
    return result


def disassemble(blob: bytes, elf: ELFFile, symbols: list[dict], symbol: dict) -> None:
    offset = va_to_offset(elf, symbol["value"])
    if offset is None:
        raise SystemExit("symbol is not inside a loadable segment")
    size = symbol["size"] or 256
    code = blob[offset : offset + size]
    engine = Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
    engine.detail = True
    starts = [item["value"] for item in symbols]
    plt_symbols = load_plt_symbols(elf)
    page_values: dict[int, int] = {}

    print(f"{symbol['name']} @ 0x{symbol['value']:x}, {size} bytes")
    for insn in engine.disasm(code, symbol["value"]):
        notes: list[str] = []
        operands = insn.operands
        if insn.mnemonic == "adrp" and len(operands) == 2:
            if operands[0].type == ARM64_OP_REG and operands[1].type == ARM64_OP_IMM:
                page_values[operands[0].reg] = operands[1].imm
        elif insn.mnemonic == "adr" and len(operands) == 2:
            if operands[0].type == ARM64_OP_REG and operands[1].type == ARM64_OP_IMM:
                page_values[operands[0].reg] = operands[1].imm
                text = printable_at(blob, elf, operands[1].imm)
                if text:
                    notes.append(repr(text))
        elif insn.mnemonic == "add" and len(operands) >= 3:
            dst, base, immediate = operands[:3]
            if (
                dst.type == ARM64_OP_REG
                and base.type == ARM64_OP_REG
                and immediate.type == ARM64_OP_IMM
                and base.reg in page_values
            ):
                address = page_values[base.reg] + immediate.imm
                page_values[dst.reg] = address
                text = printable_at(blob, elf, address)
                if text:
                    notes.append(repr(text))
                target = nearest_symbol(symbols, starts, address)
                if target:
                    notes.append(target)
        if operands and operands[-1].type == ARM64_OP_IMM and insn.mnemonic.startswith("b"):
            target_address = operands[-1].imm
            target = plt_symbols.get(target_address) or nearest_symbol(symbols, starts, target_address)
            if target:
                notes.append(target)
        suffix = f"  ; {' | '.join(notes)}" if notes else ""
        print(f"0x{insn.address:08x}:  {insn.mnemonic:<8} {insn.op_str:<42}{suffix}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("elf", type=Path)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list", metavar="REGEX", help="list symbols matching a regex")
    group.add_argument("--disasm", metavar="TEXT", help="disassemble the unique symbol containing text")
    parser.add_argument("--limit", type=int, default=200)
    args = parser.parse_args()

    blob = args.elf.read_bytes()
    with args.elf.open("rb") as stream:
        elf = ELFFile(stream)
        symbols = load_symbols(elf)
        if args.list is not None:
            regex = re.compile(args.list, re.IGNORECASE)
            matches = [item for item in symbols if regex.search(item["name"])]
            for item in matches[: args.limit]:
                print(f"0x{item['value']:x}\t{item['size']:6}\t{item['type']}\t{item['name']}")
            print(f"# matches: {len(matches)}", file=sys.stderr)
            return

        if args.disasm.lower().startswith("0x"):
            wanted_address = int(args.disasm, 16)
            matches = [item for item in symbols if item["value"] == wanted_address]
            if not matches:
                matches = [{"name": f"raw_{args.disasm}", "value": wanted_address, "size": 512, "type": "STT_FUNC"}]
        else:
            matches = [item for item in symbols if args.disasm in item["name"]]
        functions = [item for item in matches if item["type"] == "STT_FUNC"]
        if len(functions) != 1:
            print("Expected one function; candidates:", file=sys.stderr)
            for item in functions[: args.limit]:
                print(item["name"], file=sys.stderr)
            raise SystemExit(2)
        disassemble(blob, elf, symbols, functions[0])


if __name__ == "__main__":
    main()
