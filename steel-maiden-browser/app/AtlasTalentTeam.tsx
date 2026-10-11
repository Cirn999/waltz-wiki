/* eslint-disable @next/next/no-img-element -- reuse original talent and portrait assets */
import TablePortrait from "./TablePortrait";
import type { AtlasMaiden } from "./CardAtlas";
import { activeAtlasTeam, atlasTeamCapacity, sumAtlasTeamTalents, type AtlasTeamAction, type AtlasTeamWorkspace } from "./atlasTeamState";
import "./atlas-talent-team.css";

export default function AtlasTalentTeam({ workspace, members, talents, selectedTalents, canAddMembers, onAction, onOpen }: {
  workspace: AtlasTeamWorkspace; members: AtlasMaiden[]; talents: { name: string; image: string }[];
  selectedTalents: readonly string[]; canAddMembers: boolean; onAction: (action: AtlasTeamAction) => void; onOpen: (id: number) => void;
}) {
  const active = activeAtlasTeam(workspace);
  const totals = sumAtlasTeamTalents(members);
  return <aside className="atlas-team" aria-label="才艺配队模拟">
    <header className="atlas-team-heading"><h3>才艺配队</h3><strong>{members.length}<span> / {atlasTeamCapacity}</span></strong></header>
    <div className="atlas-team-controls">
      <label><span>当前方案</span><select aria-label="当前配队方案" value={active.id} onChange={(event) => onAction({ type: "select", id: Number(event.target.value) })}>
        {workspace.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {plan.memberIds.length}/{atlasTeamCapacity}</option>)}
      </select></label>
      <button type="button" onClick={() => onAction({ type: "create" })}>＋ 新建方案</button>
    </div>
    <p className="atlas-team-status" role="status">{active.name} · {members.length === atlasTeamCapacity ? "已满员，请先移除一辆再添加" : canAddMembers ? "点击头像右下角 ＋ 加入本方案" : "开启才艺筛选后可开始配队"}</p>
    <ol className="atlas-team-slots" aria-label={`${active.name}的成员`}>
      {Array.from({ length: atlasTeamCapacity }, (_, index) => {
        const maiden = members[index];
        return maiden ? <li key={maiden.id} data-team-member-id={maiden.id}>
          <div className="atlas-team-portrait"><TablePortrait maiden={maiden} onOpen={onOpen} />
            <button type="button" className="atlas-team-toggle" data-selected="true" aria-label={`从${active.name}移除 ${maiden.tank}`} title="移出当前方案" onClick={() => onAction({ type: "toggle", maidenId: maiden.id })}>−</button>
          </div>
          <span className="atlas-team-member-name" title={maiden.tank}>{maiden.tank}</span>
        </li> : <li className="atlas-team-empty-slot" key={`empty-${index}`}><span>{index + 1}</span><small>待加入</small></li>;
      })}
    </ol>
    <div className="atlas-team-totals">
      <h4>才艺合计 <small>绿色为当前筛选项</small></h4>
      <ul aria-label={`${active.name}的才艺合计`}>{talents.map(({ name, image }) => <li key={name} data-team-talent={name} data-total={totals[name] ?? 0} data-highlighted={selectedTalents.includes(name)} data-empty={!totals[name]}>
        <img src={image} alt="" /><span>{name}</span><strong>{totals[name] ?? 0}</strong>
      </li>)}</ul>
    </div>
    <p className="atlas-team-note">统计队伍的全部才艺；筛选、搜索和皮肤切换不影响成员。</p>
    <div className="atlas-team-actions">
      <button type="button" disabled={!members.length} onClick={() => { if (window.confirm(`清空${active.name}的全部成员？其他方案不受影响。`)) onAction({ type: "clear" }); }}>清空本方案</button>
      <button type="button" disabled={workspace.plans.length === 1} onClick={() => { if (!members.length || window.confirm(`删除${active.name}？其他方案不受影响。`)) onAction({ type: "delete" }); }}>删除本方案</button>
    </div>
  </aside>;
}
