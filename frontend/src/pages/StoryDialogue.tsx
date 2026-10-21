import type { StoryScene } from '@common/game/story-narrative.ts';
import { useSession } from '../api/session.ts';

export function StoryDialogue({ scenes, expanded }: { scenes: StoryScene[]; expanded?: string }) {
  const { state } = useSession();
  const protagonist = state?.units.find(unit => unit.isProtagonist || unit.id === state.player.protagonist)?.name ?? '你';
  return <div className="story-scenes">{scenes.map(scene => (
    <details key={scene.id} className="story-scene" open={scene.id === expanded} data-scene={scene.id}>
      <summary>{scene.title}</summary>
      <div className="story-lines">
        {scene.lines.map((line, index) => line.speaker === '旁白'
          ? <p className="story-narrator" key={index}>{line.text}</p>
          : <p className={`story-line${line.speaker === '你' ? ' protagonist' : ''}`} key={index}>
            <b>{line.speaker === '你' ? protagonist : line.speaker}</b><span>{line.text}</span>
          </p>)}
      </div>
    </details>
  ))}</div>;
}
