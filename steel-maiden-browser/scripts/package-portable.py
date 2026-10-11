#!/usr/bin/env python3
"""Create the Windows portable release after a successful static build."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "steel-maiden-browser"
RELEASE = ROOT / "release"
PACKAGE_NAME = "钢舞姬战术档案库_超大科技树截图修正版_2026-09-09"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--server-url", default="http://127.0.0.1:3000/")
    args = parser.parse_args()
    source_site = APP / "dist/client"
    source_launcher = APP / "launcher/launcher-new.exe"
    package = RELEASE / PACKAGE_NAME
    archive = RELEASE / f"{PACKAGE_NAME}.zip"
    if args.verify_only:
        # The root launcher serves dist/client during development; keep the
        # server-rendered shell there as well as in the portable package.
        if not (source_site / "index.html").exists() and (package / "site/index.html").exists():
            shutil.copy2(package / "site/index.html", source_site / "index.html")
        root_result = subprocess.run([str(ROOT / "点我启动.exe"), "--self-test"], cwd=ROOT, check=False)
        package_result = subprocess.run([str(package / "点我启动.exe"), "--self-test"], cwd=package, check=False)
        with zipfile.ZipFile(archive) as bundle:
            names = set(bundle.namelist())
            archive_ok = all(
                any(name.endswith(suffix) for name in names)
                for suffix in ("/点我启动.exe", "/site/index.html", "/site/data/research-tree.json", "/数据导出/研发配方明细.csv", "/数据导出/研发资源消耗明细.csv")
            )
        result = {
            "rootLauncherExitCode": root_result.returncode,
            "packageLauncherExitCode": package_result.returncode,
            "archiveContentsOk": archive_ok,
            "archiveBytes": archive.stat().st_size,
            "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if root_result.returncode or package_result.returncode or not archive_ok:
            raise SystemExit(1)
        return
    for required in (source_site / "data/research-tree.json", source_launcher):
        if not required.exists():
            raise SystemExit(f"missing release input: {required}")
    if package.exists() or archive.exists():
        raise SystemExit(f"release target already exists: {package} or {archive}")

    package.mkdir(parents=True)
    shutil.copytree(source_site, package / "site")
    try:
        with urllib.request.urlopen(args.server_url, timeout=15) as response:
            html = response.read()
    except Exception as exc:
        raise SystemExit(f"start the production server on {args.server_url} before packaging") from exc
    if b"_next/static" not in html:
        raise SystemExit("production server did not return the expected app shell")
    (package / "site/index.html").write_bytes(html)
    (source_site / "index.html").write_bytes(html)
    shutil.copy2(source_launcher, package / "点我启动.exe")
    shutil.copy2(source_launcher, ROOT / "点我启动.exe")
    exports = package / "数据导出"
    exports.mkdir()
    for name in ("研发科技树.json", "研发配方明细.csv", "研发资源消耗明细.csv", "钢舞姬上下级索引.csv"):
        shutil.copy2(ROOT / "analysis_apk/output/research_tree" / name, exports / name)
    (package / "使用说明.txt").write_text(
        "钢舞姬战术档案库（研发科技树版）\n\n"
        "1. 请先完整解压 ZIP，不能直接在压缩包预览窗口中运行。\n"
        "2. 双击‘点我启动.exe’，程序会自动打开默认浏览器。\n"
        "3. 在页面的‘数据视图’中选择‘研发关系图’，先指定一位钢舞姬，再查看从最上游到最下游的完整纵向研发链。\n"
        "4. 多名共同前置会放在同一紧凑框中，主链头像较大、协同头像较小；每条关系使用独立的完整连接线。画布没有横向滚动条，可按住空白处拖动浏览。\n"
        "5. 悬停头像会临时高亮路线；单击头像可锁定高亮。锁定后可点击‘只看高亮路线’，隐藏无关容器并重新紧凑排布；点击‘恢复全部容器’或‘取消路线高亮’即可恢复。\n"
        "6. 双击头像可跳转到对应的研发科技树详情；点击‘下载完整画布 PNG’会按当前普通、高亮或仅高亮状态导出整张关系图，而不只是浏览器可见区域。超大科技树会自动选择安全清晰度，避免浏览器画布超限或长时间卡住。\n"
        "7. ‘研发科技树’会详细列出每套配方的指挥官等级、银币、图纸、装备的 S 等级和其他材料。\n"
        "8. 同一方案内多个前置和资源为 AND；多套资源方案是不同活动、渠道或时期的配置变体，不累计，请以游戏当前开放方案为准。\n"
        "9. 关闭启动器窗口即可停止本地服务；应用不需要联网。\n\n"
        "数据来源：测试服 APK / patch _1.18 静态配置。\n",
        encoding="utf-8-sig",
    )
    shutil.make_archive(str(RELEASE / PACKAGE_NAME), "zip", RELEASE, PACKAGE_NAME)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    print(json.dumps({
        "package": str(package),
        "archive": str(archive),
        "bytes": archive.stat().st_size,
        "sha256": digest,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
