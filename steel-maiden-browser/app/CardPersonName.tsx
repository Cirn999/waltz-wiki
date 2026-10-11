"use client";
/* eslint-disable @next/next/no-img-element -- approved complete-name typography graphics */
import { memo, useState } from "react";
import labels from "../public/data/card-person-labels.json";

const rows: Record<string, { person: string; image: string; width: number; height: number }> = labels.rows;

export default memo(function CardPersonName({ id, person }: { id: number; person: string }) {
  const [failed, setFailed] = useState(false);
  const label = rows[id];
  // The readable text remains available to assistive technology. If catalog text
  // changes before graphics are regenerated, don't display a stale person's name.
  if (!label || label.person !== person || failed) return <span className="atlas-person-name">{person}</span>;
  return <img className="atlas-person-name atlas-person-image" data-person-font="SimSun-cold-white" src={label.image} alt={person}
    width={label.width} height={label.height} loading="lazy" decoding="async" draggable={false}
    style={{ height: `calc(var(--atlas-person-size, 5.7cqw) * ${label.height / labels.em})` }} onError={() => setFailed(true)} />;
});
