import { CERTIFICATE_NOTE, classify, regionLabel } from './certificate'
import type { Certificate } from './certificate'

export async function certificateImage(c: Certificate): Promise<Blob> {
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1440
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이미지를 만들 수 없는 브라우저입니다. 감정서 링크를 공유해 주세요.')
  const font = '"Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif'
  function setFont(size: number, weight = 400) {
    ctx!.font = `${weight} ${size}px ${font}`
  }
  function wrap(text: string, width: number) {
    let line = ''
    const lines: string[] = []
    for (const char of Array.from(text)) {
      if (line && ctx!.measureText(line + char).width > width) {
        lines.push(line)
        line = ''
      }
      line += char
    }
    if (line) lines.push(line)
    return lines
  }
  setFont(36, 600)
  const regionLines = wrap(regionLabel(c), 860)
  canvas.height = 1500 + Math.max(0, regionLines.length - 2) * 48
  const h = canvas.height,
    t = classify(c.observation)
  ctx.fillStyle = '#f8f4e9'
  ctx.fillRect(0, 0, 1080, h)
  ctx.strokeStyle = '#b9c2a9'
  ctx.lineWidth = 2
  ctx.strokeRect(32, 32, 1016, h - 64)
  ctx.strokeRect(44, 44, 992, h - 88)
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    weight = 400,
    color = '#284433',
    align: CanvasTextAlign = 'left',
  ) => {
    setFont(size, weight)
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.fillText(value, x, y)
  }
  text('BOOGER ATLAS', 80, 110, 28, 700)
  text('세계 코딱지 지질조사국', 1000, 110, 24, 400, '#65745d', 'right')
  ctx.strokeStyle = '#c9cfbc'
  ctx.beginPath()
  ctx.moveTo(80, 140)
  ctx.lineTo(1000, 140)
  ctx.stroke()
  text('국제 코딱지 표본 감정서', 540, 225, 51, 700, '#284433', 'center')
  text(
    c.mode === 'demo' ? '데모 표본 · 이 브라우저에서 작성' : '사용자 입력 기반 · 공유용 감정서',
    540,
    275,
    25,
    400,
    '#728066',
    'center',
  )
  // Deterministic illustrative contours, not a photograph or an inferred microscopic analysis.
  ctx.save()
  ctx.translate(540, 455)
  ctx.strokeStyle = '#d9dece'
  ctx.lineWidth = 1
  for (const radius of [95, 140, 185]) {
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(-210, 0)
  ctx.lineTo(210, 0)
  ctx.moveTo(0, -180)
  ctx.lineTo(0, 180)
  ctx.stroke()
  ctx.fillStyle = t.color.hex
  ctx.strokeStyle = '#536249'
  ctx.lineWidth = 3
  const shape = new Path2D(
    'M -95 -56 C -108 -112 -28 -130 25 -105 C 55 -95 100 -113 119 -55 C 145 0 83 31 87 69 C 86 119 17 133 -24 101 C -59 82 -110 100 -121 45 C -139 1 -84 -14 -95 -56 Z',
  )
  ctx.fill(shape)
  ctx.stroke(shape)
  ctx.clip(shape)
  ctx.strokeStyle = '#f9f4df88'
  ctx.lineWidth = 3
  for (let i = 0; i < 6; i++) {
    ctx.beginPath()
    ctx.ellipse(-18 + i * 7, 12, 28 + i * 17, 16 + i * 13, -0.4, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
  text('특징을 표현한 일러스트', 540, 665, 22, 400, '#7c876f', 'center')
  text(t.name, 540, 737, 49, 700, '#284433', 'center')
  text(t.subtype, 540, 783, 30, 400, '#68795b', 'center')
  ctx.fillStyle = '#e8eddf'
  ctx.fillRect(245, 815, 590, 64)
  text(`표본 분류번호  ${t.code}`, 540, 858, 29, 600, '#46613b', 'center')
  text('발견 지역', 90, 942, 25, 400, '#7a866d')
  regionLines.forEach((line, i) => text(line, 90, 990 + i * 48, 36, 600))
  const y = 1040 + Math.max(0, regionLines.length - 1) * 48
  text(`발견 날짜   ${c.observation.date}`, 90, y, 30, 400)
  ctx.strokeStyle = '#c9cfbc'
  ctx.beginPath()
  ctx.moveTo(90, y + 35)
  ctx.lineTo(990, y + 35)
  ctx.stroke()
  const values = [
    ['색상', t.color.label],
    ['크기', t.size.label],
    ['건조도', `${c.observation.dryness}/5 · ${t.dryness}`],
  ]
  values.forEach(([label, value], i) => {
    const x = 90 + i * 302
    text(label, x, y + 85, 25, 400, '#7a866d')
    text(value, x, y + 135, i === 2 ? 30 : 38, 600)
  })
  text(t.comment, 540, h - 195, 27, 500, '#657258', 'center')
  setFont(24)
  wrap(CERTIFICATE_NOTE, 900).forEach((line, i) =>
    text(line, 540, h - 137 + i * 33, 24, 400, '#7a866d', 'center'),
  )
  text('나의 표본도 감정받기 · BOOGER ATLAS', 540, h - 63, 27, 700, '#284433', 'center')
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('이미지 생성에 실패했습니다. 링크 공유를 이용해 주세요.')),
      'image/png',
    ),
  )
}
