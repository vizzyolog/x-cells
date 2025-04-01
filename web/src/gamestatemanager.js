// gamestatemanager.js

import { EventEmitter } from 'events';
import { initGamepad } from './gamepad';
import { camera } from './camera';
import {scene} from './scene';

class GameStateManager extends EventEmitter {
    constructor(ws) {
        super();
        this.terrainMeshCreated = false;
        this.playerMeshCreated = false;
        this.terrainMesh = null;
        this.playerMesh = null;
        this.ws = ws;
        this.scene = scene;
    }

    setTerrainMesh(mesh) {
        this.terrainMesh = mesh;
        this.terrainMeshCreated = true;
        this.checkGameState();
    }

    setPlayerMesh(mesh) {
        this.playerMesh = mesh;
        this.playerMeshCreated = true;
        this.checkGameState();
    }

    checkGameState() {
        if (this.terrainMeshCreated && this.playerMeshCreated) {
            initGamepad(camera, this.terrainMesh, this.playerMesh, this.ws, this.scene);
            this.emit('gameInitialized');
            console.warn("[Game State Manager] game initialized!!!")
        }
    }
}

// Создаем экземпляр GameStateManager с ws
export let gameStateManager;

export function initGameStateManager(ws, scene){
    gameStateManager = new GameStateManager(ws, scene);
}