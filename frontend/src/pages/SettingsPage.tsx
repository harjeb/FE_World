import { useState } from 'react';
import { CHARACTERS } from '@common/data/characters.ts';
import { OP } from '@common/protocol/ops.ts';
import { agentBundle, agentToken, type AgentToken } from '../api/client.ts';
import { session, useSession } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { ART_CREDITS } from '../battle/battle-sheets.ts';
import { loadSettings, saveSettings } from '../battle/settings.ts';
import type { ScenePolicy, Settings } from '../battle/settings.ts';
import { go, links } from '../router.ts';
import { agentOnline, Shell } from '../shell/Shell.tsx';
import { clockTime } from '../ui/calendar.ts';
import { toast } from '../ui/toast.tsx';
import { copyText } from '../ui/clipboard.ts';
import { ConfirmButton } from '../ui/Modal.tsx';
import { useAct } from './SystemParts.tsx';

function PasswordForm({ clearAgent }: { clearAgent: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return <form aria-label="修改密码" onSubmit={async e => {
    e.preventDefault();
    if (next !== confirm || pending) return;
    setPending(true); setError('');
    try { await session.changePassword(current, next); clearAgent(); setCurrent(''); setNext(''); setConfirm(''); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setPending(false); }
  }} style={{ padding: 16, display: 'grid', gap: 12 }}>
    <h3>修改密码</h3>
    <p>修改后所有登录会话和 Agent 令牌立即失效，需要重新登录并重新连接 Agent。</p>
    <fieldset disabled={pending} style={{ display: 'grid', gap: 12 }}>
      <label>当前密码<input name="currentPassword" type="password" autoComplete="current-password" required minLength={1} maxLength={128} value={current} onChange={e => setCurrent(e.target.value)} /></label>
      <label>新密码（8–128 字符）<input name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={next} onChange={e => setNext(e.target.value)} /></label>
      <label>确认新密码<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      {confirm && next !== confirm && <p role="alert">两次密码不一致</p>}
      {error && <p role="alert">{error}</p>}
      <button className="btn btn-danger" type="submit" disabled={pending || next.length < 8 || next !== confirm}>{pending ? '修改中…' : '修改密码并退出'}</button>
    </fieldset>
  </form>;
}

const SCENES: [ScenePolicy, string][] = [['all', '全部播放'], ['boss', '仅主将战'], ['off', '关闭']];
const mask = (token: string) => (token.length > 12 ? `${token.slice(0, 6)}…${token.slice(-4)}` : '••••');

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return <button type="button" className="toggle" aria-pressed={on} onClick={() => onChange(!on)}><span className="knob" aria-hidden="true" />{label}</button>;
}

// 设置: the account, connecting an Agent (docs/06: the Agent logs in with an sk_ token over /ws), and the
// battle display defaults the battle page starts from (battle/settings.ts, kept in this browser only).
export function SettingsPage() {
  const { state } = useSession();
  const { busy, act } = useAct();
  const [agent, setAgent] = useState<AgentToken | null>(null);
  const [shown, setShown] = useState(false);
  const copy = async (text: string) => {
    try { await copyText(text); toast('已复制'); }
    catch { setShown(true); toast('复制失败，请手动选中复制'); }
  };
  const [view, setView] = useState<Settings>(loadSettings);
  const { data: info } = useServerData(() => session.agentInfo(), []);
  if (!state) return null;
  const online = agentOnline(state);
  const lease = state.control;
  const update = (patch: Partial<Settings>) => setView(v => { const next = { ...v, ...patch }; saveSettings(next); return next; });
  const hero = state.units.find(u => u.isProtagonist);
  const protagonist = hero?.name ?? CHARACTERS[state.player.protagonist as keyof typeof CHARACTERS]?.name ?? state.player.protagonist;

  return (
    <Shell current="settings">
      <div className="brief-head">
        <div>
          <div className="eyebrow">设置</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>账号与 Agent</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>把接入令牌交给你的 Agent，它就能代你游玩；战斗显示的偏好只保存在这台浏览器里。</p>
        </div>
      </div>

      <div className="sys-cols">
        <div className="colstack">
          <section className="panel" aria-labelledby="ag-h">
            <div className="ph">
              <h2 id="ag-h">Agent 接入</h2>
              <span className="inline-flex items-center gap-1.5" style={{ fontSize: 13, color: online ? '#45603B' : '#6A6256' }}>
                <span className="dot" style={{ background: online ? '#536D49' : '#9A9184' }} />{online ? '在线' : '离线（5 分钟内没有收到请求）'}
              </span>
            </div>
            <p className="sys-note">Agent 用接入令牌通过 WebSocket 发送 LOGIN，之后能做的事和网页一样：出击、整备、竞技场、观战说明都走同一套协议。令牌等同账号密码，只交给你自己的 Agent。</p>
            {agent
              ? (
                <dl className="facts">
                  <dt>接入令牌</dt>
                  <dd className="token-row">
                    <code style={{ userSelect: 'text', overflowWrap: 'anywhere' }}>{shown ? agent.token : mask(agent.token)}</code>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShown(s => !s)}>{shown ? '隐藏' : '显示'}</button>
                    <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void copy(agent.token)}>复制</button>
                  </dd>
                  <dt>HTTP API</dt><dd><code>{agent.apiUrl}</code></dd>
                  <dt>接入操作</dt><dd>
                    <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void copy(agentBundle(agent))}>复制给 AI</button>{' '}
                    <ConfirmButton title="重置令牌" message="旧 Agent 令牌将立即失效，需要把新令牌重新交给 Agent。确定重置？" confirmLabel="重置令牌" className="btn btn-sm btn-danger" disabled={busy !== null} onConfirm={() => void act('token', () => agentToken(true).catch(error => { setAgent(null); setShown(false); throw error; }), r => { setAgent(r); setShown(false); void session.refresh().catch(() => toast('令牌已重置，请刷新页面同步控制权')); return '令牌已重置，旧令牌已失效'; })}>重置令牌</ConfirmButton>
                  </dd>
                  <dt>连接地址</dt><dd><code>{agent.ws}</code></dd>
                  <dt>协议版本</dt><dd>docVersion {agent.docVersion} · {agent.rulesetVersion} · 目录 {agent.catalogVersion} · <a href={agent.docs} target="_blank" rel="noreferrer">接口说明</a> · <a href={new URL('/agent-api.json', agent.apiUrl).href} target="_blank" rel="noreferrer">JSON</a></dd>
                </dl>
              )
              : (
                <div className="go-bar" style={{ borderTop: 0 }}>
                  <button type="button" className="btn btn-primary" disabled={busy !== null}
                    onClick={() => void act('token', () => agentToken(), r => { setAgent(r); return '已取得接入令牌'; })}>
                    {busy === 'token' ? '读取中…' : '取得接入令牌'}
                  </button>
                </div>
              )}
          </section>

          <section className="panel" aria-labelledby="ct-h">
            <div className="ph"><h2 id="ct-h">控制权</h2><span className={`tag ${lease ? 'tag-brass' : 'tag-grey'}`}>{lease ? `${lease.owner === 'agent' ? 'Agent' : '网页'}持有 · 至 ${clockTime(lease.expiresAt)}` : '未锁定'}</span></div>
            <p className="sys-note">网页与 Agent 做的事完全一样。两边同时在线时，可以先取得 5 分钟的控制租约：租约期内只有持有方能写入（出击、买卖、行动……），另一方仍可查看。到期自动释放，也可以主动释放。</p>
            <div className="go-bar" style={{ borderTop: 0 }}>
              {lease?.owner === 'human' && <button type="button" className="btn" disabled={busy !== null} onClick={() => void act('release', () => session.run(OP.RELEASE_CONTROL), () => '已释放控制权')}>释放</button>}
              <button type="button" className="btn btn-primary" disabled={busy !== null || (!!lease && lease.owner !== 'human')}
                onClick={() => void act('claim', () => session.run<{ expiresAt: number }>(OP.CLAIM_CONTROL), r => `网页取得控制权，至 ${clockTime(r.expiresAt)}`)}>
                {lease?.owner === 'human' ? '续期 5 分钟' : '由网页取得控制权'}
              </button>
            </div>
            {lease && lease.owner !== 'human' && <p className="pfoot">Agent 持有控制权时，网页的写操作会被拒绝；等租约到期或请 Agent 发送 RELEASE_CONTROL。</p>}
          </section>

          <section className="panel" aria-labelledby="bs-h">
            <div className="ph"><h2 id="bs-h">战斗显示</h2><span style={{ fontSize: 12, color: '#6A6256' }}>进入战斗时的默认值，战斗中也能随时切换</span></div>
            <div className="set-rows">
              <div><span>敌方威胁区</span><Toggle on={view.threat} label={view.threat ? '显示' : '隐藏'} onChange={threat => update({ threat })} /></div>
              <div><span>网格</span><Toggle on={view.grid} label={view.grid ? '显示' : '隐藏'} onChange={grid => update({ grid })} /></div>
              <div>
                <span>交战演出</span>
                <span className="chips" role="group" aria-label="交战演出">
                  {SCENES.map(([v, label]) => <button key={v} type="button" className="chip" aria-pressed={view.scenes === v} onClick={() => update({ scenes: v })}>{label}</button>)}
                </span>
              </div>
              <div>
                <span>地图缩放</span>
                <span className="chips" role="group" aria-label="地图缩放">
                  {([2, 3] as const).map(z => <button key={z} type="button" className="chip" aria-pressed={view.zoom === z} onClick={() => update({ zoom: z })}>{z}×</button>)}
                </span>
              </div>
            </div>
          </section>
        </div>

        <div className="colstack">
          <section className="panel" aria-labelledby="ar-h">
            <div className="ph"><h2 id="ar-h">Agent 的报告</h2>{info?.model && <span className="tag tag-grey">{info.model}</span>}</div>
            <dl className="facts">
              <dt>培养计划</dt><dd>{info?.plan ?? '还没有上报'}</dd>
              <dt>离线日报</dt><dd>{info?.dailyReport ?? '还没有日报'}</dd>
            </dl>
            {(state.features?.spectate || state.features?.reports) && <div className="go-bar">
              {state.features.spectate && <a className="btn btn-sm" href={links.spectate}>实时观战</a>}
              {state.features.reports && <a className="btn btn-sm btn-ghost" href={links.reports}>战报</a>}
            </div>}
          </section>

          <section className="panel" aria-labelledby="ac-h">
            <div className="ph"><h2 id="ac-h">账号</h2></div>
            <dl className="facts">
              <dt>指挥官</dt><dd>{state.player.name}</dd>
              <dt>军团</dt><dd>{state.player.legion}</dd>
              <dt>主角</dt><dd>{protagonist}</dd>
            </dl>
            <div className="go-bar">
              <a className="btn btn-ghost" href={links.rules}>规则手册</a>
              <button type="button" className="btn btn-danger" onClick={() => { session.logout(); go(links.camp); }}>退出登录</button>
            </div>
          </section>

          <section className="panel"><PasswordForm clearAgent={() => { setAgent(null); setShown(false); }} /></section>

          <section className="panel" aria-labelledby="cr-h">
            <div className="ph"><h2 id="cr-h">美术鸣谢</h2></div>
            <p style={{ fontSize: 13, color: '#4E473D' }}>
              交战动画改编自 <a href={ART_CREDITS.repository} target="_blank" rel="noreferrer">FE-Repo</a> 社区素材；标注 IS 的原作动画版权属于
              Nintendo / Intelligent Systems，本作为非商业同人项目。感谢各位作者：
            </p>
            <ul style={{ fontSize: 12, color: '#4E473D', paddingLeft: 18, listStyle: 'disc', maxHeight: 220, overflowY: 'auto' }}>
              {ART_CREDITS.packs.map(pack => <li key={pack.pack}>
                <details>
                  <summary>{pack.title} — {pack.attribution}</summary>
                  <a href={pack.url} target="_blank" rel="noreferrer">原始素材与署名</a>
                  <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit' }}>{pack.creditsVerbatim}</pre>
                </details>
              </li>)}
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}
