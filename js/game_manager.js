function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size = size; // Tamaño del grid
  this.inputManager = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator = new Actuator;

  this.startTiles = 2;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Borrar el mensaje de juego ganado/perdido
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Borrar el mensaje de juego ganado/perdido
};


// Devuelve verdadero si el juego se pierde o se gana y el usuario no ha seguido jugando
GameManager.prototype.isGameTerminated = function () {
  return this.over || (this.won && !this.keepPlaying);
};


// Configurar el juego
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Recargar el juego desde un juego anterior si está presente
  if (previousState) {
    this.grid = new Grid(previousState.grid.size,
      previousState.grid.cells); // Recargar grid
    this.score = previousState.score;
    this.over = previousState.over;
    this.won = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid = new Grid(this.size);
    this.score = 0;
    this.over = false;
    this.won = false;
    this.keepPlaying = false;

    // Agrega los mosaicos iniciales
    this.addStartTiles();
  }

  // Actualizar el actuador
  this.actuate();
};


// Coloca las fichas iniciales para comenzar el juego con
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};


// Agrega un mosaico en una posición aleatoria
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);

    this.grid.insertTile(tile);
  }
};

// Envía la grilla actualizada al actuador
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }


  // Borra el estado cuando el juego termina (solo juego terminado, no ganador)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score: this.score,
    over: this.over,
    won: this.won,
    bestScore: this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Representar el juego actual como un objeto
GameManager.prototype.serialize = function () {
  return {
    grid: this.grid.serialize(),
    score: this.score,
    over: this.over,
    won: this.won,
    keepPlaying: this.keepPlaying
  };
};


// Guardar todas las posiciones de los mosaicos y eliminar la información de fusión
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Mueve un mosaico y su representación
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Mueve mosaicos en la cuadrícula en la dirección especificada
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // No hagas nada si el juego ha terminado

  var cell, tile;

  var vector = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved = false;

  // Guardar las posiciones de mosaico actuales y eliminar la información de fusión
  this.prepareTiles();

  // Atraviesa la cuadrícula en la dirección correcta y mueve las fichas
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next = self.grid.cellContent(positions.next);


        // ¿Solo una fusión por recorrido de fila?
        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);


          // Converge las posiciones de los dos mosaicos
          tile.updatePosition(positions.next);

          // Actualizar la puntuación
          self.score += merged.value;


          if (merged.value === 2048) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // ¡La ficha se movió de su celda original!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile();

    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};


// Obtener el vector que representa la dirección elegida
GameManager.prototype.getVector = function (direction) {
  // Vectores que representan el movimiento de los mosaicos
  var map = {
    0: { x: 0, y: -1 }, // Up
    1: { x: 1, y: 0 },  // Right
    2: { x: 0, y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};


// Crea una lista de posiciones para recorrer en el orden correcto
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }


  // Atraviesa siempre desde la celda más lejana en la dirección elegida
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;


  // Avance hacia la dirección del vector hasta encontrar un obstáculo
  do {
    previous = cell;
    cell = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
    this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell // Se usa para verificar si se requiere una fusión
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};


// Comprobar las coincidencias disponibles entre fichas (verificación más cara)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell = { x: x + vector.x, y: y + vector.y };

          var other = self.grid.cellContent(cell);

          if (other && other.value === tile.value) {
            return true;
            // Estas dos fichas se pueden fusionar
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};
