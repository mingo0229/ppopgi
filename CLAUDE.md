# 뽑기 남은 횟수 - 작업 안내

인형뽑기 횟수를 세어 주는 설치형 웹앱(PWA)입니다. GitHub Pages로 배포되며 주소는 https://mingo0229.github.io/ppopgi/ 입니다.
`main`에 올리면 1~2분 안에 그대로 반영됩니다.

## 커밋 규칙

- 요구사항과 개선 방향은 저장소 주인(mingo0229)이 정하고, 코드는 Claude가 작성합니다.
- 커밋 작성자는 `mingo0229 <112161696+mingo0229@users.noreply.github.com>`로 하고, Claude는 커밋 메시지 끝의 `Co-Authored-By`로 표기합니다.
  - `git config user.name "mingo0229"`
  - `git config user.email "112161696+mingo0229@users.noreply.github.com"`

## 구조

- `index.html` 하나에 화면, 스타일, 스크립트가 모두 들어 있습니다. 빌드 과정은 없습니다.
- 규칙 계산은 `/* logic:start */`와 `/* logic:end */` 사이의 순수 함수(`RULES`, `summarize`, `nextOpen`, `ledgerRows`)입니다.
- 기록은 localStorage의 `ppopgi-tongjang:v1`, 내 인형 그림은 `ppopgi-tongjang:v1:plush`에 저장합니다. 이 키 이름을 바꾸면 사용자의 기록이 사라집니다.
- `sw.js`는 앱 파일을 기기에 보관합니다(보관본으로 먼저 열고, 뒤에서 새 버전을 받아 다음에 열 때 반영). `index.html`을 고칠 때 `sw.js`의 `CACHE` 이름도 바꿔 주면 옛 보관본이 정리됩니다.

## 확인

- 규칙을 고치면 `node dev/test.mjs`를 돌립니다. 규칙 숫자를 바꾸면 테스트의 기대값도 함께 고칩니다.
- 화면을 고치면 모바일 크기(390px, 360px)에서 직접 열어 확인합니다.

## 지켜야 할 것

- 사용자가 고른 그림은 기기 밖으로 보내지 않습니다.
- 캐릭터 이미지처럼 남의 저작물은 이 저장소에 올리지 않습니다.
