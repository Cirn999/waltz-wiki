/* eslint-disable @next/next/no-img-element -- reuse the native story avatar assets and verified crops */
import type { CSSProperties } from "react";
import type { StoryCharacter, StoryFrame } from "./storyTypes";
import "./stories.css";

export type StoryChatFrame = Pick<StoryFrame, "id" | "kind" | "text" | "speaker" | "player" | "head" | "side" | "item">;

function Avatar({ character }: { character?: StoryCharacter }) {
  const crop = character?.avatarCrop;
  const cropStyle: CSSProperties | undefined = crop ? {
    width: String(100 * crop.sourceWidth / crop.size) + "%",
    left: String(-100 * crop.x / crop.size) + "%",
    top: String(-100 * crop.y / crop.size) + "%",
  } : undefined;
  return <span className={"story-avatar" + (crop ? " is-cropped" : character?.avatar ? "" : " is-portrait")}>
    {character?.avatar || character?.image
      ? <img loading="lazy" src={character.avatar || character.image} style={cropStyle} alt="" />
      : <span aria-hidden="true">?</span>}
  </span>;
}

export default function StoryChatLine({ frame, character, index, current = false }: {
  frame: StoryChatFrame;
  character?: StoryCharacter;
  index: number;
  current?: boolean;
}) {
  return frame.kind !== "dialogue"
    ? <div data-frame-index={index} className="story-chat-narration">
      <p>{frame.text}</p>{frame.item && <img loading="lazy" src={frame.item} alt="剧情道具" />}
    </div>
    : <article className={"story-chat-line " + (frame.side ?? "left")} data-frame-index={index} data-current={current}>
      <Avatar character={character} />
      <div><strong>{frame.player ? "指挥官" : frame.speaker}</strong><p>{frame.text}</p></div>
    </article>;
}
