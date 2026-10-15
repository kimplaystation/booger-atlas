import { useId } from 'react'
export default function Specimen({ color = '#b7a45a' }: { color?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 320 300" className="specimen-art" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d="M76 102C57 52 124 34 166 56C202 69 244 45 259 95C281 139 233 166 237 200C236 242 178 254 144 229C111 211 66 224 57 180C42 141 89 135 76 102Z" />
        </clipPath>
      </defs>
      <g fill="none" stroke="#d2d8c5">
        <circle cx="160" cy="150" r="135" />
        <circle cx="160" cy="150" r="100" />
        <path d="M5 150h310M160 0v300" strokeDasharray="3 5" />
      </g>
      <path
        fill={color}
        stroke="#667454"
        strokeWidth="1.5"
        d="M76 102C57 52 124 34 166 56C202 69 244 45 259 95C281 139 233 166 237 200C236 242 178 254 144 229C111 211 66 224 57 180C42 141 89 135 76 102Z"
      />
      <g clipPath={`url(#${id})`} fill="none" stroke="#fff7da" strokeOpacity=".45">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <ellipse
            key={i}
            cx={143 + i * 5}
            cy="166"
            rx={20 + i * 17}
            ry={13 + i * 14}
            transform="rotate(-24 160 150)"
          />
        ))}
      </g>
      <circle cx="253" cy="58" r="4" fill="#a26148" />
      <path d="M253 58h38" stroke="#a26148" />
    </svg>
  )
}
