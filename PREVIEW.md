# 브라우저에서 사이트 열기

## 이미 Vercel에 저장소를 연결했다면

`kimplaystation/booger-atlas`의 `main` 브랜치에 코드가 올라가면 Vercel이 자동으로 빌드와 배포를 시작합니다.

1. Vercel에서 `booger-atlas` 프로젝트를 엽니다.
2. 왼쪽 **Deployments**를 클릭합니다.
3. 최신 배포의 상태가 **Ready**가 되면 해당 배포를 엽니다.
4. **Visit** 또는 표시된 `vercel.app` 주소를 클릭합니다.

체크리스트의 개인 도메인, 방문 통계, 유료 업그레이드는 데모 확인에 필요하지 않습니다. **No Production Deployment**가 계속 표시되면 Deployments에서 배포가 생성되었는지, Settings의 Git 연결 및 Production Branch가 `main`인지 확인하세요. 실패한 배포는 Build Logs에서 오류를 확인할 수 있습니다.

## 처음 Vercel에 연결한다면

1. https://vercel.com/new 에서 GitHub 계정으로 로그인합니다.
2. `kimplaystation/booger-atlas`를 Import 합니다.
3. Node.js는 24.x, Framework는 Vite로 설정합니다.
4. 데모를 확인할 때는 환경변수를 비워 두고 Deploy를 누릅니다.

저장소의 `vercel.json`이 설치 명령 `npm ci`, 빌드 명령 `npm run build`, 출력 폴더 `dist`를 지정합니다.

## 데모와 공동 수집

설정 없이 배포한 앱은 데모 모드입니다. 기록은 방문자의 브라우저에만 저장되며 다른 사람에게 공유되지 않습니다.

실제 공동 수집을 켜려면 README의 Supabase 설정을 완료하고 공개 환경변수 2개를 Vercel 빌드 환경에 넣어 재배포합니다. 서버 `ALLOWED_ORIGINS`에도 실제 사이트 Origin을 추가합니다. 관리자 비밀키를 프런트엔드 환경변수에 넣으면 안 됩니다.

소스는 GitHub 저장소의 **Code → Download ZIP**에서 내려받을 수 있습니다. 클라우드 작업공간의 내부 파일 경로는 다운로드 링크로 사용할 수 없습니다.

코드 업로드와 Vercel 배포 성공은 별개입니다. 실제 접속 주소는 Vercel의 배포 완료 화면에서 확인해야 합니다.
