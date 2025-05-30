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
        this.playerID = null;      // Динамический ID игрока, получаемый от сервера
        this.playerObjectID = null; // ID объекта игрока в мире
        this.isPlayerIDReceived = false; // Флаг получения ID от сервера
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

    // Устанавливает player ID, полученный от сервера
    setPlayerID(playerID, objectID) {
        this.playerID = playerID;
        this.playerObjectID = objectID;
        this.isPlayerIDReceived = true;
        console.log(`[GameStateManager] Установлен player ID: ${playerID}, object ID: ${objectID}`);
    }

    // Возвращает ID объекта игрока для отправки команд
    getPlayerObjectID() {
        return this.playerObjectID;
    }

    // Возвращает player ID
    getPlayerID() {
        return this.playerID;
    }

    // Проверяет, получен ли player ID от сервера
    isPlayerReady() {
        return this.isPlayerIDReceived && this.playerObjectID !== null;
    }

    // Сбрасывает состояние при отключении
    reset() {
        this.playerMesh = null;
        this.playerID = null;
        this.playerObjectID = null;
        this.isPlayerIDReceived = false;
        console.log('[GameStateManager] Состояние сброшено');
    }

    // Инициализация с WebSocket
    init(ws, scene) {
        this.ws = ws;
        this.scene = scene;
    }
}

// Создаем singleton экземпляр
const gameStateManager = new GameStateManager();

export function initGameStateManager(ws, scene){
    gameStateManager.init(ws, scene);
}

// Экспортируем singleton по умолчанию
export default gameStateManager;
export { gameStateManager };