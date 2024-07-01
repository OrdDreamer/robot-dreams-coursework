const prompt = require('prompt-sync')();
const Colors = require('colors');
const {startRoomId, rooms, resources} = require("./config/config.js");

const log = console.log;

// Використані патерни
// Abstract Factory
// Builder
// Factory Method
// Singleton
// Strategy

class GameBuilder {
    constructor() {
        this.game = new Game();
    }

    setPlayer(name) {
        this.game.player = new Player(name);
        return this;
    }

    addRooms(rooms) {
        this.game.rooms = rooms.reduce((accumulator, current) => {
            accumulator[current.id] = this.createRoom(current);
            return accumulator;
        }, {});
        return this;
    }

    setActiveRoom(id) {
        const startRoom = this.game.rooms[id];
        if (!startRoom) {
            log("Помилка конфігурації".red);
            log("Гра завершена".gray);
            return;
        }
        this.game.activeRoom = startRoom;
        return this;
    }

    addResources(resources) {
        this.game.resources = resources.reduce((accumulator, current) => {
            accumulator[current.id] = current;
            return accumulator;
        }, {});
        return this;
    }

    build() {
        return this.game;
    }

    createRoom(roomData) {
        if (roomData.type === "normal") {
            return RoomFactory.createNormalRoom(roomData);
        } else if (roomData.type === "winning") {
            return RoomFactory.createWinningRoom(roomData);
        } else if (roomData.type === "death") {
            return RoomFactory.createDeathRoom(roomData);
        } else {
            log("Unknown type of room");
        }
    }
}

class Game {
    static #instance = null;

    constructor() {
        if (Game.#instance) {
            return Game.#instance;
        }
        this.player = null;
        this.rooms = [];
        this.activeRoom = null;
        this.resources = [];
        this.actions = [];
        this.isRunning = true;

        this.showCheat = false;
        this.setStrategy(new MainActionStrategy());
        Game.#instance = this;
    }

    setStrategy(strategy) {
        this.strategy = strategy;
    }

    start() {
        while (this.isRunning) {
            this.strategy.execute(this);
        }
        log("Гра завершена.".cyan);
    }

    showActionMenu() {
        log("\n Обери дію ".bgGreen);
        this.actions.forEach((action, index) => {
            log(`${index + 1}. ${action.name}.`);
        });
    }

    chooseInventoryActions() {
        this.actions = [
            ...this.player.inventory.map((resourceId) => ({
                name: `Викинути ${this.resources[resourceId].name}`,
                callback: () => {
                    this.player.inventory = this.player.inventory.filter((resource) => resource !== resourceId)
                    this.activeRoom.resources.push(resourceId);
                },
            })),
            {
                name: "Повернутись назад",
                callback: () => {
                    this.setStrategy(new MainActionStrategy());
                },
            },
            {
                name: "Завершити гру".gray,
                callback: () => {
                    this.isRunning = false;
                },
            },
        ]
    }

    chooseBackToMainActions() {
        this.actions = [
            {
                name: "Повернутись назад",
                callback: () => {
                    this.setStrategy(new MainActionStrategy());
                },
            },
            {
                name: "Завершити гру".gray,
                callback: () => {
                    this.isRunning = false;
                },
            },
        ]
    }

    chooseMainActions() {
        this.actions = [
            {
                name: "Перевірити інвентар",
                callback: () => {
                    this.setStrategy(new InventoryActionStrategy());
                },
            },
            ...(this.activeRoom.resources && this.activeRoom.resources.length
                ? this.activeRoom.resources.map((resourceId) => ({
                    name: `Взяти ${this.resources[resourceId].name}`,
                    callback: () => {
                        this.activeRoom.resources = this.activeRoom.resources.filter((resource) => resource !== resourceId)
                        this.player.inventory.push(resourceId);
                    },
                }))
                : []),
            ...this.activeRoom.connections.map((connection) => ({
                name: `Перейти до ${connection.name}`.green,
                callback: () => {
                    const isConditionCompleted = this.checkConnectCondition(connection.condition);
                    if (isConditionCompleted) {
                        this.activeRoom = this.rooms[connection.roomId];
                    } else {
                        this.setStrategy(new UncompletedConditionActionStrategy(connection.condition))
                    }
                },
            })),
            {
                name: (this.showCheat ? "Приховати підказку" : "Показати підказку").gray,
                callback: () => {
                    this.showCheat = !this.showCheat;
                },
            },
            {
                name: "Завершити гру".gray,
                callback: () => {
                    this.isRunning = false;
                },
            },
        ];
    }

    handleChoice(choice) {
        if (choice < 1 || choice > this.actions.length) {
            log("Невірний вибір.");
            return;
        }
        const action = this.actions[choice - 1];
        action?.callback();
    }

    printInventory() {
        log("\n" + "Ваш інвентар:".underline);
        if (this.player.inventory.length) {
            this.player.inventory.map((resourceId) => {
                log(" * ".yellow.bold + this.resources[resourceId].name);
            });
        } else {
            log("(Пусто)")
        }
    }

    printResources() {
        if (this.activeRoom.resources && this.activeRoom.resources.length) {
            log("\n" + "Тут можна дещо забрати з собою:".underline);
            this.activeRoom.resources.map((resourceId) => {
                log(" * ".yellow.bold + this.resources[resourceId].name);
            });
        } else {
            log("\n" + "Тут немає нічого, що можна взяти з собою.".underline)
        }
    }

    printConnections() {
        if (this.activeRoom.connections && this.activeRoom.connections.length) {
            log("\n" + "Звідси можна потрапити в:".underline)
            this.activeRoom.connections.map((connection) => {
                log("-> ".yellow.bold + connection.name);
            });
        } else {
            log("\n" + "Звідси немає виходу...".underline)
        }
    }

    checkConnectCondition(condition) {
        if (!condition) {
            return true;
        } else if (condition.type === "has") {
            return this.player.isHasOnInventory(condition.resourceId);
        } else {
            return true;
        }
    }

    getFormattedTextOfRoomName(name) {
        return ` Ви зараз в ${name.underline} `.bold.yellow.inverse;
    }
}

class Strategy {
    execute(game) {
        throw new Error("This method should be overridden.");
    }
}

class MainActionStrategy extends Strategy {
    execute(game) {
        console.clear();
        log(game.getFormattedTextOfRoomName(game.activeRoom.name));

        game.activeRoom.execute(game);
        if (!game.isRunning) {
            return;
        }

        game.printResources();
        game.printConnections();

        game.showCheat && console.table([
            "Win: name -> 2 -> 4 -> 3 -> 3 -> 2 -> 3 -> 3 -> 4 -> 3",
            "Win: name -> 4 -> 3 -> 3 -> 3 -> 3",
            "Key: name -> 2 -> 4 -> 3 -> 3",
            "Death: name -> 2 -> 3 -> 3",
            "Death: name -> 2 -> 4 -> 3 -> 3 -> 2 -> 3 -> 3 -> 3",
            "Death: name -> 4 -> 3 -> 3 -> 3 -> 2 -> 3",
            "Death: name -> 4 -> 3 -> 3 -> 4",
            "Death: name -> 4 -> 4 -> 3",
        ])

        game.chooseMainActions();
        game.showActionMenu();
        const choice = parseInt(prompt("Ваш вибір: "));
        game.handleChoice(choice);
    }
}

class InventoryActionStrategy extends Strategy {
    execute(game) {
        console.clear();
        log(game.getFormattedTextOfRoomName(game.activeRoom.name));

        game.printInventory();

        game.chooseInventoryActions();
        game.showActionMenu();
        const choice = parseInt(prompt("Ваш вибір: "));
        game.handleChoice(choice);
    }
}

class UncompletedConditionActionStrategy extends Strategy {
    constructor(condition) {
        super();
        this.condition = condition;
    }

    execute(game) {
        console.clear();
        log(game.getFormattedTextOfRoomName(game.activeRoom.name));

        log(this.condition.description);

        if (this.condition.type === "has") {
            log(`\nНеобхідно мати:\n${game.resources[this.condition.resourceId].name}`.red)
        }

        game.chooseBackToMainActions();
        game.showActionMenu();
        const choice = parseInt(prompt("Ваш вибір: "));
        game.handleChoice(choice);
    }
}

class AbstractRoom {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.description = data.description;
        this.connections = data.connections;
        this.resources = data.resources;
    }

    execute(game) {
    }
}

class DeathRoom extends AbstractRoom {
    execute(game) {
        log(this.description.italic);
        log("Ви програли...\n".red.bold)
        game.isRunning = false;
    }
}

class Room extends AbstractRoom {

    execute(game) {
        log(this.description.italic);
    }
}


class WinningRoom extends AbstractRoom {

    execute(game) {
        log(this.description.italic);
        log(` Вітаємо, ${game.player.name}, Ви виграли! \n`.green.inverse.bold)
        game.isRunning = false;
    }
}

class AbstractRoomFactory {
    static createNormalRoom() {
        throw new Error("This method should be overridden.");
    }

    static createDeathRoom() {
        throw new Error("This method should be overridden.");
    }
}

class RoomFactory extends AbstractRoomFactory {
    static createNormalRoom(roomData) {
        return new Room(roomData);

    }

    static createWinningRoom(roomData) {
        return new WinningRoom(roomData);

    }

    static createDeathRoom(roomData) {
        return new DeathRoom(roomData);
    }
}

class Player {
    constructor(name) {
        this.name = name;
        this.inventory = [];
    }

    isHasOnInventory(resourceId) {
        return !!this.inventory.find((id) => id === resourceId);
    }
}


log(" Введіть ваше ім'я ".bgGreen);
const playerName = prompt("Ваше ім'я:".underline + " ");

const game = new GameBuilder()
    .setPlayer(playerName)
    .addRooms(rooms)
    .setActiveRoom(startRoomId)
    .addResources(resources)
    .build();

game.start();
