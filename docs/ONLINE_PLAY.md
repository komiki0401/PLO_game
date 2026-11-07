# 友達とのオンライン対戦

ホールデム・ノンリミット、PLO4・プリフロップ、PLO5・Wボードボムポットで2〜6人が対戦できます。登録不要の招待制です。CPU戦・既存のスコア・設定の保存形式は変更しません。オンライン専用の画面を使い、既存の音声・CPU戦の履歴リプレイはオンライン画面には含めていません。

## 遊び方

タイトルの「友達とオンライン対戦」から表示名を入力し、ゲーム・初期チップ・BB／アンティを指定して部屋を作ります。招待URLを友達へ共有し、全員の接続後にホストが開始します。手番は45秒。時間切れはチェックできればチェック、それ以外はフォールドです。ハンド終了後、ホストが次のハンドに進めます。

通信切断後は最大5回自動再接続し、接続できない場合は再接続ボタンを表示します。同じタブの再読み込みでも元の席に戻れます。再接続用の秘密情報はそのタブのsessionStorageに保存し、招待URLには含めません。タブを閉じたり保存領域を消すと席を復元できません。ホストが切断すると接続中の最も若い席へ進行役を移します。脱落後も観戦できます。

部屋は作成から24時間で削除します。開始後の新規参加、席の入れ替え、NPC補充、チャット、途中のチップ補充は今回の範囲外です。待合室の参加者が離脱したまま戻らない場合や、メンバーを変更する場合は新しい部屋を作成してください。対戦チップはプレイチップ専用です。

## ローカル起動

Node.js 24 / npm 11を使います。

```sh
npm ci
npm run dev:online
```

別のターミナルで `npm run dev` を起動し、`http://localhost:5173` を開きます。開発時の対戦サーバーは `http://127.0.0.1:8787` が既定です。スマホなど別端末からローカル環境へ接続する場合は、その端末からアクセスできるサーバーURLと許可Originを別途設定する必要があります。

```sh
npm test
npm run build
npm run build:worker
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:e2e:online
```

オンラインE2Eは6つの独立したブラウザコンテキストで、全3ゲームを各2ハンド進めます。7人目拒否、再接続、プライベートな配信内容、チップ保存則、CPU戦のスコアを変更しないことも検証します。Wranglerの状態は `.wrangler/` に保存され、Gitには含めません。

## 無料枠で公開する初回設定

GitHub Pagesだけでは対戦サーバーは動きません。Cloudflareの無料アカウントでWorkersとSQLite Durable Objectsを有効にします。有料プランへの変更は不要な構成ですが、利用可能な機能・無料枠・上限時の挙動は公開時点のCloudflareダッシュボードで確認してください。無料枠を超える規模の無制限利用は保証しません。今回のコードは課金プランへの変更や購入を行いません。

### 方法A: 自分のPCから公開

```sh
npx wrangler login
npm run deploy:online
```

アカウント選択後、`poker-friends` WorkerとSQLite Durable Objectsの初回マイグレーションを作成します。同名Workerが既にある場合は、`wrangler.jsonc` のnameを固有のものへ変更してから実行してください。表示された `https://poker-friends.<自分のサブドメイン>.workers.dev` を控えます。

### 方法B: GitHub Actionsから公開

GitHubリポジトリのSettings → Secrets and variables → Actionsへ、次を登録します。秘密値をコード・チャット・VITE_変数に入れないでください。

| 種類 | 名前 | 内容 |
| --- | --- | --- |
| Repository secret | CLOUDFLARE_API_TOKEN | 対象アカウントだけのCloudflare Workersデプロイ用APIトークン |
| Repository variable | CLOUDFLARE_ACCOUNT_ID | 対象のCloudflareアカウントID |

Cloudflareの「Edit Cloudflare Workers」APIトークンテンプレートを使い、対象アカウントを絞ってください。Durable Objectsの作成権限が含まれることを確認します。GitHub Actionsの「Deploy online poker server」をmainに対して手動実行すると、検証後にデプロイします。APIトークンはCloudflareの公式画面で作成し、GitHub Secretsへ直接保存します。

### フロントエンドを接続

1. Repository variable `VITE_ONLINE_SERVER_URL` に上記のWorker HTTPS URLを設定します。これは公開URLであり秘密情報ではありません。
2. GitHub Actionsの「Test and deploy to GitHub Pages」をmainで手動実行します。
3. 公開ページのオンラインボタンから部屋を作り、別端末へ招待URLを送って確認します。

`VITE_ONLINE_SERVER_URL` が未設定の本番ビルドでは「準備中」と表示し、部屋作成・入室を無効にします。CPU戦は引き続き遊べます。許可する画面のOriginは `wrangler.jsonc` の `ALLOWED_ORIGINS` で指定します。既定は `https://komiki0401.github.io`、パス `/PLO_game/` は付けません。独自ドメインへ移す場合はここも更新してください。秘密の再接続トークンを含まない招待URLだけを共有します。

## サーバー側の仕組み

- 部屋ごとに1つのDurable Objectが状態とWebSocket接続を管理し、操作を直列に処理します。
- 既存の共通ゲームエンジンをサーバーで実行。配札にはWeb Crypto乱数を使い、クライアントの山札・手札指定を受け付けません。
- 手番・合法な額・状態のrevisionを検証し、遅延操作や二重送信を拒否します。
- 他人の伏せ札・山札・バーンカード・再接続情報は配信しません。ショーダウン時のみ非フォールド席の手札を公開します。全員フォールドの勝者の手は公開しません。
- 秘密トークンはサーバーではSHA-256ハッシュで保存します。部屋データはDurable Objectsの永続ストレージに保存し、休止後も復元します。
- 手番の期限・部屋削除はDurable Objectのalarmで管理。WebSocketの自動ping/pong応答で、通常の待機時に不要なWorker実行を抑えます。
- 接続元Origin、メッセージの大きさ・頻度・接続数を制限します。部屋作成はログイン不要です。不特定多数への一般公開や大量アクセスに使う場合は、Turnstile・部屋作成の追加レート制限などを別途検討してください。
