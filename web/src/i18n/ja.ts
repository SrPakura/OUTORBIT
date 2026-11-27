import type { WebDictionary } from './es';

export const ja: WebDictionary = {
  nav: {
    home: 'ホーム',
    bestiary: '3D図鑑',
    arsenal: '戦闘＆武装',
    resources: '技術＆透明性',
    play: 'プレイ →',
    ostPlay: 'BGM',
    ostMute: '消音',
  },
  home: {
    kicker: '3D 無重力キネティック・アリーナ・ローグライト · BASE44 CONTEST',
    pitch:
      '直径90mの無重力ジオデシックドームで繰り広げる3Dハイスピード空間アクション。ニュクス（Nyx）を操り、ダッシュ、壁でのキネティック反射、そして34 m/s超のドリルキックで敵の星雲外殻を貫き、内部のスターコアを砕け。',
    chips: ['球形アリーナ 90M', '0G キネティック物理', 'OPEN SOURCE · THREE.JS'],
    ctaPlay: '今すぐプレイ',
    ctaVote: 'BASE44で投票 ★',
    ctaTrailer: 'トレーラーを見る ↓',
    gridHint: 'カーソル移動（引力井戸）またはクリック（反発プッシュ）でグリッドが歪みます',
    trailerKicker: 'ドーム周波数 · 公式トレーラー',
    trailerTitle: 'コンテスト映像送信',
    trailerFreq: 'FREQUENCY 01 // CONTEST CUT (BASE44 EDITION)',
    trailerPendingTitle: '公開待機中の信号スロット',
    trailerPendingDesc:
      'Base44 × Nitro Web Game Contest 用の公式トレーラー枠です（contestConfig.ts から MP4 / YouTube を接続可能）。',
    pillarsKicker: 'ゲームコア · 3つの柱',
    pillarsTitle: 'OUTORBIT とは？',
    pillars: [
      {
        num: '01',
        title: '90m 無重力ドームの縦横無尽アクション',
        body: '破壊可能な10枚の軌道スラブが巡る閉鎖球形アリーナ。天井や壁面を逆さまに走り、無重力空間へ跳び出し、3 m/s以上で着地する「タッチ＆ゴー」でエデンを即座に+12%回復。',
      },
      {
        num: '02',
        title: '星雲外殻 vs 内部スターコア',
        body: 'すべての敵は外殻の厚さ（8〜90）の奥に黄金のスターコア（star_core）を隠している。18 m/s以上でドリルキック（×1.55）を発動し、外殻を一撃で貫通して核を破壊（×2.2ダメージ）。',
      },
      {
        num: '03',
        title: '全15ウェーブのキネティック・ローグライト',
        body: '7種のアクティブスキルと3種のパッシブを獲得・強化。0.25×のスローモーション、重力場での敵弾捕獲カウンター、88.6mの白い障壁への叩きつけを駆使し、終焉龍クロノスに挑め。',
      },
    ],
    portalsKicker: 'インタラクティブ・アーカイブ',
    portalsTitle: '探索セクションを選ぶ',
    portals: [
      {
        num: '01',
        route: '/bestiary',
        tag: '9体のGLBモデル · X線解析',
        title: 'キャラクター＆3Dエネミー図鑑',
        desc: 'ニュクスと8種の敵モデルを3Dで回転鑑賞。キネティックX線で星雲外殻を透視してスターコアを確認し、全61種のGLBアニメーションを再生可能。',
        cta: '3D図鑑を開く →',
      },
      {
        num: '02',
        route: '/arsenal',
        tag: '物理シミュレーター · 7スキル',
        title: 'キネティック研究所＆武装一覧',
        desc: '0〜34 m/sの速度シミュレーターで各敵への貫通閾値をリアルタイム計算し、7枚のスキルカードと隠しシナジー、操作ガイドを確認。',
        cta: '研究所を開く →',
      },
      {
        num: '03',
        route: '/resources',
        tag: 'BASE44 · SHADERS · AUDIO',
        title: '開発リソース・AI透明性・シェーダー',
        desc: '人間によるゲームデザイン領域とAI実装領域の明確な開示、完全無料・オープンソース宣言、GLSLレイヤー解析、SynthAudio生合成デモ。',
        cta: 'リソースを見る →',
      },
    ],
    contestKicker: 'BASE44 × NITRO WEB GAME CONTEST',
    contestTitle: 'プレイ＆投票（BASE44）',
    contestDesc:
      'ダウンロードやログイン不要でブラウザから即プレイ可能。Base44 Launchpadにてコミュニティ投票を受け付けています。',
    contestPlayBtn: 'ブラウザでプレイ',
    contestPlayNote: 'PCブラウザ（幅768px以上）とマウス（ポインターロック）またはゲームパッドが必要です。',
    contestVoteBtn: 'BASE44 LAUNCHPADで投票 ★',
    contestVoteNote: 'あなたの1票がOUTORBITをコミュニティTop 25へ押し上げます。',
    mobileShareBtn: 'PCで遊ぶためにリンクを送る / コピー',
    mobileCopied: 'コピー完了！PCブラウザで開いてください',
    mobileNote:
      'OUTORBIT本編はPC（マウスまたはコントローラー）専用です。このスマホから投票し、PCへリンクを送信してプレイできます！',
  },
  bestiary: {
    kicker: 'ドーム図鑑 · 検証済み9体のGLBモデル',
    title: '主人公＆脅威アーカイブ',
    subtitle: 'オンデマンド読込・実機シェーダー・キネティックX線搭載の単一WebGL 3Dビューワー。',
    groupProtag: '主人公',
    groupBasic: '基本ウェーブ敵',
    groupBoss: 'エリート＆最終ボス',
    xrayOn: '⚡ X線モード稼働中（スターコア露出）',
    xrayOff: '⚡ ドリル貫通シミュレート（外殻 → スターコアX線）',
    whiteInk: '白インク輪郭',
    autoRotate: '自動回転',
    loadingModel: '3Dモデル読込中...',
    dragHint: 'ドラッグ回転 · ホイール拡大縮小',
    clipsTitle: 'GLBアニメーションクリップ（クリックで再生）',
    noClipsNyx: 'ビューワーではニュクスの3種宇宙パレットを確認でき、本編では18個の専用GLBクリップで動作します。',
    statsHp: '基礎HP',
    statsFlesh: '外殻の厚さ',
    statsRadius: '半径',
    statsExp: 'EXP',
    statsWeak: '弱点コア数',
    statsBarrier: '障壁耐性',
    yes: 'あり（エリート/ボス）',
    no: 'なし（接触即死）',
    aiFlowTitle: 'AIステートマシン構造',
    counterTitle: '攻略＆カウンター法',
    penetrationNeeded: '一撃貫通に必要なキネティック力 ≥',
    entities: {
      nyx: {
        name: 'NYX（ニュクス）',
        role: '0G キネティック主人公',
        summary:
          'Cosmic Nebulaシェーダーと白インク輪郭（0.015 / 0.011 / 0.008）を纏う重力戦闘パイロット。飛行速度を物理貫通力へ変換し、接地・無重力・キネティック反射の6状態を自在に切り替える。',
        aiFlow: ['GROUNDED（スラブ吸着）', 'FLOATING 0G（最大28 m/s）', 'DASH（31 m/s · 0.36秒）', 'ドリルキック（≥ 18 m/s · ×1.55）', 'キネティック反射（消費エデン0）'],
        counter:
          'ロックが外れた際は0.25×のリダイレクション・スローモーションが自動発動。外周88.6mの白い障壁に激突すると20ダメージを受けるため注意。',
      },
      abyssal_cell: {
        name: 'アビサル・セル（深淵細胞）',
        role: '基本ウェーブ奇襲型',
        summary:
          '外殻が薄い（15）狡猾な小型捕食者。背後から忍び寄るが、6.5m以内でニュクスに直視されるとパニック逃走（Flee）し、有糸分裂で増殖する。',
        aiFlow: ['IDLE FLOAT', 'SNEAK（背後接近）', 'FLEE（視認6.5m以内で逃走）', 'WINDUP → LUNGE', 'DUPLICATE（分裂）'],
        counter:
          '通常のダッシュやグラビティキックで容易に外殻15を貫通可能。逃走されたら31 m/sダッシュで追撃するか、反発プッシュで白い障壁へ叩き込もう。',
      },
      crab_gunner: {
        name: 'クラブ・ガンナー（砲台蟹）',
        role: '軌道スラブ砲台',
        summary:
          '10枚の浮遊スラブ上を跳躍しながら移動。パリィ可能な3連射弾、2.0秒の予兆後に放つ40 HP/sの連続レーザー、さらに窮地では自爆特攻を仕掛ける。',
        aiFlow: ['スラブ歩行', 'スラブ間ジャンプ', 'レーザー充填（2.0秒）', 'レーザー照射（40 HP/s）', 'カミカゼ特攻'],
        counter:
          '浮遊スラブを遮蔽物として使えばレーザーの射線を物理的に遮断できる。外殻35は22.6 m/s以上のドリルキックで一撃貫通可能。',
      },
      spiral_octopus: {
        name: 'スパイラル・オクトパス（螺旋蛸）',
        role: '中距離戦術型＆カウンターパリィ',
        summary:
          '5.0秒周期で酸インク弾（16 HP＋3秒間画面55%汚染＋毎秒4 DoT）や15×8拡散巨弾を放つ。周期最後の1.5秒は危険な赤発光カウンターパリィ状態に入る。',
        aiFlow: ['2–80m帯域観測', 'ダッシュ準備（4.0秒）', '赤カウンターパリィ（最終1.5秒）', 'インク弾 / 巨弾発射', '48 m/s 高速離脱'],
        counter:
          '赤発光中の正面攻撃は厳禁（5〜10秒の画面65%汚染反撃）。重力場（Gravity Field）でインク弾を捕獲して投げ返せば90ダメージを与えられる。',
      },
      ground_golem: {
        name: 'グラウンド・ゴーレム（砕岩巨人）',
        role: '重装甲コロッサス · スラブ破壊者',
        summary:
          '外殻80・スタミナ100を持つ巨漢。正面攻撃を防ぐブロック壁、32 HPのスタン殴打、浮遊スラブを瓦礫へ粉砕する螺旋突進を繰り出す。',
        aiFlow: ['ヘリ追跡', '正面ブロック壁', '強打 / 螺旋突進', 'パリィ猶予（0.10×）', '疲労ダウン（5.0秒）'],
        counter:
          '正面ガードへの突撃は避け、攻撃に合わせてパリィすると0.10×超スローモーションが発動。背後へ回り込みスターコアを砕け（頭部追撃-35% HP）。',
      },
      lightning_butterfly: {
        name: 'ライトニング・バタフライ（雷光蝶）',
        role: '圧電水晶・超回避型スカミッシャー',
        summary:
          'HP 31の電気水晶生命体。最大5連続の広域回避ダッシュ（回避時45 m/s）でロックとホーミングを切断。10 m/sの羽ばたきで充電し、速度追尾型電撃弾と近距離電撃ビームを放つ。',
        aiFlow: ['高速羽ばたき（10 m/s · 充電）', '1–5連続ダッシュ＋追尾切断', 'バースト後の硬直（1.5–2.0秒）', '電撃弾（上限22.95 m/s · 5秒消滅）', '近距離雷撃ビーム'],
        counter:
          '小岩2発（30ダメージ）を耐え、中岩1発（32ダメージ）または硬直で撃破可能。最大の攻略法は重力場で電撃弾を捕獲すること：140ダメージ＆ダッシュでも逃げられない100%追尾マグネットになる。',
      },
      giant_sparrow: {
        name: 'ジャイアント・スパロウ（巨雀）',
        role: 'ウェーブ5 エリート · 弱点2箇所',
        summary:
          'HP 416・外殻85・胸部と口内の2つの結晶を持つ高速航空エリート。ダメージ0だが強烈に吹き飛ばすエアボール（32.3 m/s）や49.4 m/sの急降下ドリルを放つ。',
        aiFlow: ['高速チェイス飛行', 'エアボール / 暴風羽ばたき', '絶叫（カメラ揺れ）', '急降下ドリル（49.4 m/s）', '激突スタン（2.5秒）'],
        counter:
          'スラブの陰に誘って急降下ドリルを激突させると自傷55ダメージ＋0.75×スロー付きの2.5秒スタン状態となり、2つの弱点結晶が露出する。',
      },
      prisma_necroz: {
        name: 'プリズマ・ネクロズ',
        role: 'ウェーブ10 エリート · 正二十面体シールド',
        summary:
          '空間中心(0,0,0)に固定され25°/sで回転、20枚の三角シールド（半径4.9m）で防御。75mドームピラミッドや棘を展開しつつ、独自の「怠惰ゲージ（0–100）」が溜まると5秒間崩壊する。',
        aiFlow: ['20面シールド構築', '防御スパイク展開', '75mドームピラミッド', '怠惰アイドル（0→100）', '完全怠惰崩壊（5秒）'],
        counter:
          'シールドの45%以上を破壊するか、攻撃を凌いで怠惰ゲージを限界にさせ、5秒間の無防備崩壊中に外殻65を貫通しよう。',
      },
      kronos_leviathan: {
        name: '終焉龍クロノス（KRONOS）',
        role: 'ウェーブ15 最終ボス · 4つの背星核',
        summary:
          '13節の多関節ボディ（外殻90）を持つ最終ボス。通常HPではなくアンチスキップ制御された4つの背星核（star_core_1..4）を順番に砕くことで進行し、第4段階のVOID COSMOS空間での60秒スーパーノヴァ耐久戦へ突入する。',
        aiFlow: ['第1–3段階（0.5× → 1.35×速）', 'リング予兆', 'テールウィップ', 'ポータル咬撃（SOLAR RIFT）', '第4段階：60秒スーパーノヴァ'],
        counter:
          '18 m/s以上のドリル状態で背星核を1つずつ破壊（伝説スキル「インプロージョン」も有効だが第4段階は封印）。終盤60秒間はSOLAR RIFTを回避し続けろ。',
      },
    },
  },
  arsenal: {
    kicker: 'キネティック研究所 · NYXDOMECONTROLLER',
    title: '速度こそ貫通力',
    meterTitle: '照準＆外殻貫通リアルタイムシミュレーター',
    meterLabel: 'ニュクス飛行速度',
    forceLabel: 'キネティック貫通力',
    reticleNormal: '通常キック（< 12 m/s）',
    reticleBounce: 'キネティック反射可能（12.0–17.9 m/s）',
    reticleDrill: 'ドリルキック発動（≥ 18.0 m/s · 力 ×1.55）',
    penetrateTag: 'スター貫通 ×2.2',
    wearTag: '外殻摩耗 ×0.18',
    presets: {
      walk: '歩行 2.0',
      run: 'ダッシュ走 7.4',
      bounce: '反射下限 12.0',
      drill: 'ドリル閾値 18.0',
      gravity_kick: '重力キック 23.5',
      dash: '瞬間ダッシュ 31.0',
      spiral_drill: '螺旋ドリル 34.0',
    },
    lawsKicker: 'ドームの4大物理法則',
    laws: [
      {
        title: '6つの移動モード',
        body: 'grounded（スラブ全表面・天井走行可: 2.0/7.4/10.0 m/s）、floating（0G上限28 m/s）、dashing（31 m/s, 0.36秒, エデン4.5）、speed_attack（23.5–34 m/s）、kick_recover、kinetic_bounce（≤42mかつ≥12 m/sで速度100%維持＆消費0）。',
      },
      {
        title: 'タクティカル・スロー＆ヒットストップ',
        body: '敵に回避されると0.25×スロー（1.25–2.6秒）、ダッシュキャンセルで1.6秒のバレットタイム、ゴーレムパリィ時は0.10×、ヒット時は42–120 msのヒットストップが発生。',
      },
      {
        title: 'HP・エデン・タッチ＆ゴー',
        body: '基礎100 HP / 100 エデン（レベルアップ毎+5%＆全快、イージー時は×2）。スラブに> 3 m/sで着地すると「タッチ＆ゴー」が発動しエデンが+12%即回復（クールダウン2.5秒）。',
      },
      {
        title: '90mドーム＆白い障壁',
        body: '10枚の軌道スラブが2.2–4.2 m/sで周回する90m球形アリーナ。外周88.6mの白い障壁にニュクスが触れると20 HPダメージだが、基本敵を叩き込めば即死する。',
      },
    ],
    skillsKicker: 'ローグライト強化 · アクティブ3枠',
    skillsTitle: 'ドーム武装一覧',
    skillsNote: 'レベルアップで威力・範囲・弾数・回復量が強化。エデン消費量とクールダウンは常に固定。',
    costLabel: '消費',
    edenUnit: 'エデン',
    cdLabel: 'CD',
    maxLvLabel: '最大LV',
    passivesTitle: '3種のパッシブ＆イージーモード',
    easyModeTitle: 'イージーモード（設定画面から切替可）',
    easyModeDesc: '最大HPと最大エデンを2倍（×2）にし、15ウェーブ毎の速度・敵数スケーリングを無効化します。',
    rarity: {
      base: '初期',
      common: 'コモン',
      epic: 'エピック',
      legendary: 'レジェンダリー',
    },
    skillsCopy: {
      gravity_field: {
        name: 'グラビティ・フィールド（重力場）',
        desc: '周囲に岩石（15 / 32 / 58ダメージ）を浮遊させ、左クリックで追尾射出（40–64 m/s）。',
        synergy: '破壊されたスラブ片、蛸のインク弾（90 dmg）、雷光蝶の電撃弾（140 dmg・100%必中マグネット）を捕獲可能。',
      },
      repulse_push: {
        name: 'リパルス・プッシュ（反発衝撃）',
        desc: '半径12–24 mの衝撃波で敵を強烈に弾き飛ばし（力23–51）、7–19ダメージを与える。',
        synergy: '基本敵を白い障壁へ押し出して即死させ、雷光蝶の電撃弾を反射（38 dmg・46 m/s追尾）。',
      },
      eden_absorb: {
        name: 'エデン・アブソーブ（吸収）',
        desc: '静止状態（< 1.25 m/s）で発動。HPを9 / 13 / 17、エデンを32 / 44 / 56即座に回復する。',
        synergy: '消費エデン0。ドロップに頼らず持久戦を支える生存要スキル。',
      },
      attraction_well: {
        name: 'アトラクション・ウェル（引力井戸）',
        desc: '射程52–76 m。敵2体を引き寄せて互いに激突させ、各22 / 29 / 36ダメージを与える。',
        synergy: '対象が1体のみの場合、最寄りの浮遊スラブ2枚の間で圧殺する（各26 / 34 / 42ダメージ）。',
      },
      bounce_horizon: {
        name: 'バウンス・ホライゾン（跳躍地平線）',
        desc: '42 m/sで貫通三日月波を1 / 2 / 3連射（各10 / 13 / 16ダメージ）。',
        synergy: 'Lv2から段階的な自動追尾（ホーミング強度4.5 / Lv3で6.5）が解放される。',
      },
      black_hole: {
        name: 'ブラックホール',
        desc: '7 m/sで4.5秒前進する半径10.5 / 13 / 15.5 mの特異点を生成し周囲の敵を吸い込む。',
        synergy: '0.5秒ごとに最大9ヒットの範囲ダメージ（7 / 9 / 11）を与え、55 Hz重低音共鳴が鳴り響く。',
      },
      implosion: {
        name: 'インプロージョン（内破）',
        desc: '射程無制限の演出付き必殺技。ロック中の対象を空間ごと崩壊させる。',
        synergy: '基本敵を即死、エリートには最大HP 20%ダメージ、クロノスの背星核を1つ破壊（第2・第3段階のみ）。',
      },
    },
    passivesCopy: {
      speed_force: { name: '速度＋物理貫通力強化', desc: '飛行速度とキネティック貫通力を +20% / +50% / +75% 上昇。' },
      eden_regen: { name: 'エデン自然回復', desc: '静止またはスラブ接地中に毎秒 2% / 3% / 5% のエデンを回復。' },
      hp_regen: { name: 'HP自動再生', desc: '基礎1% · パッシブで毎秒 1.5% / 2% / 3% のHPを自動回復。' },
    },
    controlsKicker: 'クイック操作ガイド',
    controlsTitle: 'DOMETUTORIALCARD',
    controlsCards: [
      {
        num: '01',
        accent: '#f59e0b',
        title: '0G 移動と基本操作',
        lines: ['WASD · ドーム内＆スラブ上の3D移動', 'SPACE · 空間へ跳躍 / 空中ブレーキ', '左クリック · キネティックキック / 虚空落下', '右クリック · インパルスダッシュ（31 m/s）'],
      },
      {
        num: '02',
        accent: '#22d3ee',
        title: 'キネティック反射',
        lines: ['12 m/s以上で照準が青色（#7fd8ff）に点灯', '42 m以内の浮遊スラブに照準を合わせる', '右クリックでキネティック・スクワット発動', 'エデン消費0のまま速度100%を維持して再射出'],
      },
      {
        num: '03',
        accent: '#e11d48',
        title: 'スロー＆スキル発動',
        lines: ['1 / 2 / 3 · アクティブスキル枠を発動', 'ロック喪失時は0.25×リダイレクションスロー発生', 'TAB · レーダー＆トレーニングパネル', 'PCマウス（Pointer Lock）＆ゲームパッド完全対応'],
      },
    ],
  },
  resources: {
    kicker: '透明性 · 技術構造 · サウンド工学',
    title: '開発リソースと制作体制',
    manifestoBadge: '公式エントリー · BASE44 × NITRO WEB GAME CONTEST',
    manifestoTitle: '完全無料・完結型オープンソース宣言',
    manifestoPoints: [
      {
        title: 'コンテスト特化型プロジェクト',
        body: 'OUTORBIT は Base44 × Nitro Web Game Contest への出展作品として企画・開発されました。',
      },
      {
        title: '永久100%無料＆オープンソース',
        body: '全70,220行のソースコード、60個のGLSLシェーダー、26体のGLBモデルはすべてGitHubで公開されており、課金も登録も一切不要です。',
      },
      {
        title: '収益化・続編なしの完結作品',
        body: '広告、マイクロトランザクション、DLC、続編の予定はありません。これ自体が一つの完成された技術・芸術実験です。',
      },
    ],
    authorKicker: '制作の境界線',
    authorTitle: '人間による設計 vs AIによる実装',
    humanTitle: '100% 人間の手による著作・設計（SRPAKURA）',
    humanItems: [
      { title: '原案＆クリエイティブディレクション', desc: '作品の根幹アイデア、GRAVITY DAZE着想の無重力体験、コミック調の紙インクと宇宙の対比設計。' },
      { title: 'ゲームデザイン＆キネティック法則', desc: '速度→貫通力の物理式、外殻とスターコアの二層構造、消費0の壁反射、スローとスキル相性の全設計。' },
      { title: 'レベルデザイン＆アリーナ構成', desc: '90m球形ドーム、88.6mの即死障壁、10枚の軌道スラブ配置、タッチ＆ゴー機構の設計。' },
      { title: 'UI/UX＆3Dアートディレクション', desc: 'TitleScreenの構図、120pxジャイロ照準、陰陽HUD、レベルアップカードUI、Blenderモデル造形ディレクション。' },
    ],
    aiTitle: 'AI生成・実装パート',
    aiItems: [
      { title: 'ソースコード実装', desc: 'TypeScript、React 18、Three.js 0.187.0、60個のGLSLコード（src/内 70,220行）を人間の設計指示とレビューの下で実装。' },
      { title: 'ゲーム内BGM（OST全4曲）', desc: 'メニューとドーム戦闘で流れる4曲のサウンドトラック（menu.mp3, wave-nocturnal.mp3, wave-singularity.mp3, boss.mp3）。' },
      { title: '本公式サイトのコード生成', desc: '検証済み技術ドキュメントと本設計書に基づき生成されたReactコンポーネント群。' },
    ],
    shaderKicker: '重いポストプロセスなしで60 FPS実現',
    shaderTitle: 'GLSLシェーダー＆BLENDER構造インスペクター',
    shaderLayers: [
      { id: '01', name: 'BLENDER ジオメトリ＆リギング', detail: '最適化された26個のGLB（ニュクス18＋敵8）、敵アニメ61クリップ、ニュクス21ステート。' },
      { id: '02', name: '白インク輪郭（INVERTED HULL）', detail: 'THREE.BackSideで法線方向に押し出し（0.008–0.032）、低負荷でシャープなコミック輪郭を描画。' },
      { id: '03', name: 'プロシージャル FBM 星雲シェーダー', detail: 'スクリーンスペース4オクターブFBMで星々と星雲をリアルタイム生成し、重いテクスチャを排除。' },
      { id: '04', name: 'フレネル・リムライト＆スターコア', detail: '速度と重力に連動するリム光と、半透明外殻の奥で輝く黄金のコア（0xffcc33）。' },
    ],
    audioKicker: '1,303行 · 効果音ファイル0個',
    audioTitle: 'サウンドトラック＆SYNTHAUDIOエンジン',
    ostHeader: 'ドーム実機BGM 全4曲',
    synthHeader: '48種のWEBAUDIOリアルタイム合成SFX',
    synthDesc: 'ゲーム内の効果音はすべてWebAudio APIでブラウザ上にてリアルタイム合成。下のボタンで実機同様の音響をテストできます：',
    synthButtons: [
      { id: 'wind', label: 'キネティック風切り音テスト（Paul Kellet ピンクノイズ）' },
      { id: 'gravity', label: '重力場・ブラックホール低音ドローン（55 Hz + 110.5 Hz）' },
      { id: 'star', label: 'スターコア貫通＆破壊SFXテスト' },
      { id: 'slomo', label: 'スローモーション突入SFXテスト（0.25×）' },
    ],
  },
  footer: {
    tag: '3D ZERO-G KINETIC ARENA ROGUELITE · BASE44 CONTEST ENTRY',
    authorLabel: '企画・開発・デザイン：',
    authorName: 'SrPakura (Alejandro Pérez)',
    portfolioBtn: 'SRPAKURA ポートフォリオを見る →',
    repoBtn: 'ソースコード (GITHUB)',
    playBtn: 'BASE44でプレイ',
    socialZero: 'SNSアカウント: 0 · 100% コード・0G物理・デザイン',
  },
};
