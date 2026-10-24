import { Assets } from 'pixi.js';
import { FireCoinWin } from './fire-coin-win.js';

// круглый символ с прозрачным фоном (png, webp или avif)
const coin = await Assets.load('coin.avif');

const fx = new FireCoinWin({ coin, diameter: 400, density: 1 });
fx.position.set(app.screen.width / 2, app.screen.height / 2);
app.stage.addChild(fx);

fx.warmUp(1);   // огненное кольцо горит уже на первом кадре
app.ticker.add((ticker) => fx.update(ticker.deltaMS / 1000));

// выпал выигрыш на этом символе
fx.play();

// символ ушёл с экрана
// fx.destroy();
