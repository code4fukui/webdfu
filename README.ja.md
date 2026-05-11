# WebDFU

[
![NPM package](https://img.shields.io/npm/v/dfu)
](https://www.npmjs.com/package/dfu)
[
![CI in main branch](https://github.com/Flipper-Zero/webdfu/actions/workflows/main.yml/badge.svg)
](https://github.com/Flipper-Zero/webdfu/actions/workflows/main.yml)

[WebUSB](https://wicg.github.io/webusb/) または [Web Bluetooth](https://webbluetoothcg.github.io/web-bluetooth/) を介して、ブラウザ上で DFU (Device Firmware Upgrade) および DfuSe デバイスを操作するためのドライバです。

## 機能

*   **ファームウェアの読み書き:** デバイスファームウェアのアップロードおよびダウンロード操作を実行します。
*   **DFU & DfuSe 対応:** DFU 1.1 仕様および STMicroelectronics の DfuSe 拡張機能と互換性があります。
*   **DFU Detach:** デバイスをランタイム構成から DFU ブートローダーに切り替えます。
*   **イベント駆動の進捗管理:** 消去、書き込み、読み込みの各ステージにおける詳細な進捗イベントにより、ファームウェアの操作を追跡します。

## デモ

接続された DFU デバイスに対してファームウェアの読み込みおよび書き込みを実行できる、フル機能のデモが用意されています。

*   **ライブデモ:** [https://flipper-zero.github.io/webdfu/demo/](https://flipper-zero.github.io/webdfu/demo/)
*   **ローカルでの実行:** リポジトリをクローンし、[demo/README.md](https://github.com/Flipper-Zero/webdfu/tree/main/demo) の手順に従ってください。

## インストール

npm を使用してパッケージをインストールします：

```sh
npm install dfu
```

## 使用方法

ブラウザのセキュリティポリシーにより、WebUSB の呼び出しはボタンクリックなどのユーザーアクションによって開始される必要があります。

```javascript
import { WebDFU } from 'dfu';

// HTMLにボタンを追加します: <button id="connect-button">Connect</button>
const connectButton = document.getElementById('connect-button');

connectButton.addEventListener('click', async () => {
  try {
    // ユーザーにデバイスを要求します
    const device = await navigator.usb.requestDevice({ filters: [] });

    // WebDFUインスタンスを作成します
    const dfu = new WebDFU(device, { forceInterfacesName: true });
    await dfu.init();

    if (dfu.interfaces.length === 0) {
      throw new Error("The selected device does not have any DFU interfaces.");
    }

    // 最初のDFUインターフェースに接続します
    await dfu.connect(0);
    console.log("Device properties:", dfu.properties);

    // デバイスからファームウェアを読み込みます
    const readProcess = dfu.read();
    
    readProcess.events.on('progress', (done, total) => {
      console.log(`Read: ${Math.round((done / total) * 100)}% complete`);
    });
    
    readProcess.events.on('end', (blob) => {
      console.log('Read complete!', blob);
      // ファームウェアは現在 'blob' オブジェクトに格納されています。
    });

    readProcess.events.on('error', (error) => {
      console.error('Read error:', error);
    });

  } catch (error) {
    console.error('Failed to connect or perform DFU operation:', error);
  }
});
```

UI 要素や DfuSe 固有のフィールドを含む完全な実装については、[デモのソースコード](https://github.com/Flipper-Zero/webdfu/blob/main/demo/index.ts) を参照してください。

## API リファレンス

`WebDFU` クラスは、デバイスと対話するためのメソッドを提供します。これらのメソッドは、進捗を追跡するためのイベントエミッタを備えたプロセスオブジェクトを返します。

*   `dfu.read(xferSize, maxSize)`: デバイスからファームウェアを読み込みます。
*   `dfu.write(xferSize, data, manifestationTolerant)`: デバイスにファームウェアを書き込みます。

### プロセスイベント

返されたプロセスオブジェクトのイベントをリッスンします：

*   **読み込みプロセス:** `progress`, `error`, `end(blob)`
*   **書き込みプロセス:** `erase/process`, `write/process`, `error`, `end()`

すべてのインターフェース、ディスクリプタ、およびイベントの詳細な型定義は、[core.ts](https://github.com/Flipper-Zero/webdfu/blob/main/core.ts) で確認できます。

## 開発

プロジェクトをローカルでビルドするには、リポジトリをクローンしてインストールを行います。
