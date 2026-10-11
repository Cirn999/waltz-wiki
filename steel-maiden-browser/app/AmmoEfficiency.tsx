/* eslint-disable @next/next/no-img-element -- original local client icons */
import { formatAmmoEfficiency, type AmmoEfficiencyValues } from "./ammoEfficiencyData";
import "./ammo-efficiency.css";

export default function AmmoEfficiency({ value }: { value?: AmmoEfficiencyValues }) {
  return <span className="ammo-efficiency" aria-label="弹药对陆与对空效率">
    {([['ground', '对陆效率', '014'], ['air', '对空效率', '013']] as const).map(([key, label, code]) => {
      const text = formatAmmoEfficiency(value?.[key]);
      return <span className="ammo-efficiency-item" key={key} title={`${label} ${text}`} aria-label={`${label} ${text}`}>
        <img src={`/art/attributes/dlc-sx-${code}.webp`} alt="" /><b>{text}</b>
      </span>;
    })}
  </span>;
}
