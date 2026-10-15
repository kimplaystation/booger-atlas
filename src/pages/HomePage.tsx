import { ArrowRight, ArrowUpRight, ScanLine, FileBadge, Send } from 'lucide-react'
import Specimen from '../components/Specimen'
export default function HomePage({
  onStart,
  onExplore,
  onPlay,
}: {
  onStart: () => void
  onExplore: () => void
  onPlay: () => void
}) {
  return (
    <div className="play-home">
      <section className="invitation">
        <div className="invitation-copy">
          <p className="eyebrow">세계 코딱지 지질조사국 · 신규 표본 접수 중</p>
          <h1>
            당신의 코딱지를
            <br />
            <em>세계에 등록하세요.</em>
          </h1>
          <p className="invitation-subtitle">
            코에서 나왔지만,
            <br />
            대접은 국제적인 표본으로.
          </p>
          <p className="invitation-description">
            색상과 크기를 골라 손끝에서 톡 튕겨보세요.
            <br />
            같은 지역에서 친구의 작은 발견도 만나보세요.
          </p>
          <button className="primary start-exam" onClick={onPlay}>
            카메라로 코딱지 튕기기
            <ArrowRight size={22} />
          </button>
          <button className="text-button home-certificate-link" onClick={onStart}>
            GPS 없이 표본 검사 · 감정서 받기
          </button>
          <p className="start-caption">카메라 · GPS 주변 저장 · 근처에서 발견</p>
        </div>
        <div className="sample-display">
          <span className="sample-tape">취급 주의: 생각보다 진지함</span>
          <div className="sample-sheet">
            <div className="sheet-top">
              <span>BOOGER ATLAS</span>
              <span>감정서 미리보기 · 예시</span>
            </div>
            <h2>
              국제 코딱지
              <br />
              표본 감정서
            </h2>
            <Specimen />
            <div className="example-name">황금빛 바삭한 풍화암</div>
            <p className="example-type">미세 입자형 · BA1-YL-S-D4</p>
            <div className="example-traits">
              <span>노란색</span>
              <span>소형</span>
              <span>건조도 4/5</span>
            </div>
            <p className="example-note">실제 등록 표본이 아닌 입력 예시입니다.</p>
            <span className="sample-seal">
              코딱지
              <br />
              감정소
            </span>
          </div>
        </div>
      </section>
      <section className="exam-intro" aria-label="GPS 놀이 순서">
        <article>
          <ScanLine size={22} />
          <div>
            <span>01 · 장전</span>
            <h3>나만의 작은 표본</h3>
            <p>색상, 크기, 건조도를 고르고 GPS를 켜주세요.</p>
          </div>
        </article>
        <article>
          <FileBadge size={22} />
          <div>
            <span>02 · 발사</span>
            <h3>손가락으로 톡, 바닥으로 툭</h3>
            <p>카메라에서 튕긴 뒤 GPS 주변에 저장해요.</p>
          </div>
        </article>
        <article>
          <Send size={22} />
          <div>
            <span>03 · 발견</span>
            <h3>같은 동네에서 다시 만나요</h3>
            <p>근처 표본을 발견하고 생애 링크를 공유해요.</p>
          </div>
        </article>
      </section>
      <div className="explore-invitation">
        <div>
          <span className="eyebrow">호기심이 아직 남았다면</span>
          <h2>다른 지역에서는 무엇이 발견됐을까요?</h2>
          <p>실제 등록된 표본과 그 지역의 날씨도 살펴볼 수 있어요.</p>
        </div>
        <button className="outline" onClick={onExplore}>
          세계 관측 지도 구경하기
          <ArrowUpRight size={17} />
        </button>
      </div>
      <p className="humor-footnote">
        진지한 형식, 진지하지 않은 감정. 과학적·의학적 검사가 아닌 유머 콘텐츠입니다.
      </p>
    </div>
  )
}
