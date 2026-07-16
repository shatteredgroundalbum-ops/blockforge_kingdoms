import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
if (!canvas) throw new Error('Missing #game canvas');

const game = new Game(canvas);
game.start();
