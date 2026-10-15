import { useEffect, useState } from 'react'
import { ArrowRight, Download, Link, Share2 } from 'lucide-react'
import { certificateURL, CERTIFICATE_NOTE, classify, regionLabel } from '../lib/certificate'
import type { Certificate } from '../lib/certificate'
import { certificateImage } from '../lib/certificateImage'
import Specimen from './Specimen'

export default function CertificateView({
  certificate: c,
  shared = false,
  onStart,
  onMap,
  onAnalysis,
}: {
  certificate: Certificate
  shared?: boolean
  onStart: () => void
  onMap: () => void
  onAnalysis?: () => void
}) {
  const t = classify(c.observation),
    url = certificateURL(c)
  const [picture, setPicture] = useState<{ url: string; file: File } | null>(null)
  const [message, setMessage] = useState(''),
    [imageError, setImageError] = useState(''),
    [showLink, setShowLink] = useState(false)
  useEffect(() => {
    let disposed = false,
      objectURL = ''
    setPicture(null)
    setImageError('')
    void certificateImage(c)
      .then((blob) => {
        if (disposed) return
        objectURL = URL.createObjectURL(blob)
        setPicture({
          url: objectURL,
          file: new File([blob], `BOOGER-ATLAS-${t.code}.png`, { type: 'image/png' }),
        })
      })
      .catch((e) => {
        if (!disposed)
          setImageError(
            e instanceof Error ? e.message : '이미지 생성에 실패했습니다. 링크로 공유해 주세요.',
          )
      })
    return () => {
      disposed = true
      if (objectURL) URL.revokeObjectURL(objectURL)
    }
  }, [c, t.code])
  async function copyLink() {
    setShowLink(true)
    try {
      await navigator.clipboard.writeText(url)
      setMessage('감정서 링크를 복사했습니다. 친구에게 붙여넣어 주세요.')
    } catch {
      setMessage('아래 링크를 길게 누르거나 선택해서 복사해 주세요.')
    }
  }
  async function share() {
    setMessage('')
    if (!navigator.share) {
      await copyLink()
      return
    }
    try {
      const files =
        picture && navigator.canShare?.({ files: [picture.file] }) ? [picture.file] : undefined
      await navigator.share({
        title: '국제 코딱지 표본 감정서',
        text: `나의 코딱지는 「${t.name}」 · ${t.subtype}. 당신의 표본도 감정받아 보세요.`,
        url,
        ...(files ? { files } : {}),
      })
      setMessage('공유 창을 닫았습니다. 전송 여부는 선택한 앱에서 확인해 주세요.')
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setShowLink(true)
      setMessage('공유 창을 열지 못했습니다. 이미지 다운로드 또는 아래 링크를 이용해 주세요.')
    }
  }
  return (
    <section className="certificate-page">
      <div className="certificate-intro">
        <p className="eyebrow">
          {shared ? '친구가 보내온 작은 발견' : '접수 완료 · 거창한 감정을 마쳤습니다'}
        </p>
        <h1>{shared ? '이 표본, 어떻게 생각하세요?' : '당신의 코딱지에 이름이 생겼습니다.'}</h1>
        <p>
          {shared
            ? '이번엔 당신의 코딱지 차례입니다.'
            : '이 발견을 혼자만 알고 있기엔 조금 아깝잖아요.'}
        </p>
      </div>
      <div className="certificate-layout">
        <article className="certificate-paper" aria-label="국제 코딱지 표본 감정서">
          <div className="sheet-top">
            <span>BOOGER ATLAS</span>
            <span>FORM BA–01</span>
          </div>
          <h2>
            국제 코딱지
            <br className="certificate-title-break" /> 표본 감정서
          </h2>
          <p className="certificate-mode">
            {c.mode === 'demo'
              ? '데모 표본 · 공동 데이터에 포함되지 않음'
              : '사용자 입력 기반 · 공유용 감정서'}
          </p>
          <Specimen color={t.color.hex} />
          <p className="art-caption">특징을 표현한 일러스트</p>
          <h3>{t.name}</h3>
          <p className="certificate-subtype">{t.subtype}</p>
          <p className="classification">
            표본 분류번호 <strong>{t.code}</strong>
          </p>
          <dl className="certificate-facts">
            <div className="certificate-location">
              <dt>발견 지역</dt>
              <dd>{regionLabel(c)}</dd>
            </div>
            <div className="certificate-date">
              <dt>발견 날짜</dt>
              <dd>{c.observation.date}</dd>
            </div>
            <div>
              <dt>색상</dt>
              <dd>{t.color.label}</dd>
            </div>
            <div>
              <dt>크기</dt>
              <dd>{t.size.label}</dd>
            </div>
            <div>
              <dt>건조도</dt>
              <dd>
                {c.observation.dryness}/5 <small>{t.dryness}</small>
              </dd>
            </div>
          </dl>
          <p className="certificate-quip">“{t.comment}”</p>
          <p className="certificate-disclaimer">{CERTIFICATE_NOTE}</p>
          <div className="certificate-sign">
            <span>
              세계 코딱지 지질조사국
              <br />
              <small>작은 발견에 쓸데없는 정성을.</small>
            </span>
            <span className="ink-seal">
              표본
              <br />
              감정
            </span>
          </div>
        </article>
        <aside className="certificate-actions">
          <p className="eyebrow">발견의 완성은 공유</p>
          <h2>
            친구의 코딱지도
            <br />
            궁금하지 않나요?
          </h2>
          <p>
            이미지나 링크를 보내보세요.
            <br />
            감정서는 로그인 없이 열 수 있어요.
          </p>
          <button className="primary" onClick={() => void share()}>
            <Share2 size={18} />
            감정서 공유하기
          </button>
          {picture ? (
            <a
              className="outline download-certificate"
              href={picture.url}
              download={picture.file.name}
            >
              <Download size={18} />
              감정서 이미지 다운로드
            </a>
          ) : (
            <p role="status" className="muted">
              {imageError || '다운로드 이미지를 준비하고 있습니다…'}
            </p>
          )}
          <button className="text-button" onClick={() => void copyLink()}>
            <Link size={16} />
            감정서 링크 복사
          </button>
          <p className="share-tip">
            모바일에서는 공유 메뉴에서 앱을 선택하세요. 이미지 저장 방식은 브라우저에 따라 달라질 수
            있어요.
          </p>
          {message && (
            <p role="status" className="share-message">
              {message}
            </p>
          )}
          {showLink && (
            <label className="share-link">
              공유 링크
              <input
                aria-label="감정서 공유 링크"
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
              />
            </label>
          )}
          <div className="certificate-next">
            <button className="primary" onClick={onStart}>
              {shared ? '나도 코딱지 검사하기' : '다른 표본도 검사하기'}
              <ArrowRight size={17} />
            </button>
            {onAnalysis && (
              <button className="text-button" onClick={onAnalysis}>
                이 지역 분석 보기
                <ArrowRight size={15} />
              </button>
            )}
            <button className="text-button" onClick={onMap}>
              관측 지도로 돌아가기
              <ArrowRight size={15} />
            </button>
          </div>
          <details className="classification-rules">
            <summary>이 이름은 어떻게 정해지나요?</summary>
            <p>
              색상으로 수식어, 건조도 1~5로 점토암·퇴적암·지층암·풍화암·사막암, 크기로
              입자형·암편형·암괴형을 정합니다. 같은 특징에는 같은 이름과 분류번호를 발급합니다.
            </p>
            <p>
              BA1은 분류 규칙의 버전, 다음 문자는 색상·크기, D는 건조도입니다. 고유 접수번호나
              희귀도 점수가 아닙니다.
            </p>
          </details>
          {shared && (
            <p className="shared-notice">
              공유 링크에 담긴 사용자 입력 내용입니다. 등록 여부를 증명하는 문서가 아니며, 이
              페이지를 열어도 표본은 추가되지 않습니다.
            </p>
          )}
        </aside>
      </div>
    </section>
  )
}
