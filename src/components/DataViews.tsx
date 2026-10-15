import { localDate, summarize } from '../lib/domain'
import type { Cell, Filters } from '../lib/domain'
export function DateFilters({
  value,
  onChange,
}: {
  value: Filters
  onChange: (f: Filters) => void
}) {
  return (
    <div className="date-filters">
      <input
        aria-label="조회 시작일"
        type="date"
        min="1940-01-01"
        max={localDate()}
        value={value.from}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
      />
      <span>—</span>
      <input
        aria-label="조회 종료일"
        type="date"
        min="1940-01-01"
        max={localDate()}
        value={value.to}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
      />
    </div>
  )
}
export function Distribution({ cells, compact = false }: { cells: Cell[]; compact?: boolean }) {
  const s = summarize(cells)
  return (
    <div className={`distributions ${compact ? 'compact' : ''}`}>
      <div>
        <h3>색상 분포</h3>
        {s.colors.map((c) => (
          <div className="distribution-row" key={c.id}>
            <span>
              <i style={{ background: c.hex }} />
              {c.label}
            </span>
            <div>
              <b
                style={{ width: `${s.count ? (c.count / s.count) * 100 : 0}%`, background: c.hex }}
              />
            </div>
            <small>{c.count}개</small>
          </div>
        ))}
      </div>
      {!compact && (
        <div>
          <h3>크기 분포</h3>
          {s.sizes.map((c) => (
            <div className="distribution-row" key={c.id}>
              <span>{c.label}</span>
              <div>
                <b style={{ width: `${s.count ? (c.count / s.count) * 100 : 0}%` }} />
              </div>
              <small>{c.count}개</small>
            </div>
          ))}
          {!s.count && <p className="muted small">표본이 없어 분포를 계산할 수 없습니다.</p>}
        </div>
      )}
    </div>
  )
}
