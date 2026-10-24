import { MegaWin } from './mega-win.js';

const fx = new MegaWin({ amount: 1358856, background: false });
fx.scale.set(app.screen.width / MegaWin.WIDTH);   // сцена нарисована в 1280×720
app.stage.addChild(fx);
app.ticker.add((ticker) => fx.update(ticker.deltaMS / 1000));

// выпал mega win
fx.play();

// окно выигрыша закрыто
// fx.destroy();
