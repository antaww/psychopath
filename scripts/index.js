let buttonsContainer = document.querySelector(".buttons-container");
let playSpeedrun = document.querySelector("#playSpeedrun");
let playInfinite = document.querySelector("#playInfinite");
let lobbyBtn = document.querySelector("#lobby");
let resetBtn = document.querySelector("#reset");
let timer = document.querySelector(".timer");
let levelDiv = document.querySelector(".level");
let failCross = document.querySelector(".cross");
let nicknameDiv = document.querySelector("#nickname");
let validate = document.querySelector("#validate");
let nicknameContainer = document.querySelector(".nickname-container");
let scoreboard = document.querySelector(".scoreboard");
let colorPicker = document.querySelectorAll(".swatch");
let colorContainer = document.querySelector(".color-list");

let canvas = {
    cvs: document.querySelector(".grid"),
    ctx: document.querySelector(".grid").getContext('2d'),
}

let isPlaying = false;
let isClicking = false;
let levelFinished = false;
let timerRunning = false;

let drawnCells = [];
let userClickedCells = [];

let timerValue = 0;
let currentDifficulty = 0; // 0 = not playing, 5 = easy, 6 = medium, 8 = hard
let levelsCount = 15;
let currentLevel = 0;

let cellPathColor = "rgba(252,225,18,0.3)"
let userCellsColor = "rgba(243,75,47,0.2)";
let nickname = "";
let gameMode = "";

window.addEventListener("load", updateScoreboard);

playSpeedrun.addEventListener("click", function () {
    gameMode = "speedrun";
    UsernameDisplay();
});

playInfinite.addEventListener("click", function () {
    gameMode = "infinite";
    UsernameDisplay();
});

validate.addEventListener("click", function () {
    checkName();
});

window.addEventListener("mousedown", function () {
    if (isPlaying) {
        isClicking = true;
    }
});

window.addEventListener("mouseup", function () {
    if (isPlaying) {
        if (levelFinished) {
            if (gameMode === "speedrun") {
                if (currentLevel > levelsCount) {
                    closeGame();
                    return;
                }
            }
            levelFinished = false;
            isClicking = false;
            generateGame();
            return;
        }
        failedTry();
        isClicking = false;
    }
});

canvas.cvs.addEventListener("mousemove", function (event) {
    if (isClicking) {
        if (isPlaying) {
            let x = event.offsetX;
            let y = event.offsetY;
            getCurrentCell(x, y);
            colorCellOnClick(userCellsColor)
            if (userClickedCells.length === drawnCells.length) {
                if (areArraysEqual(userClickedCells, drawnCells)) {
                    levelFinished = true;
                } else {
                    userClickedCells = [];
                }
            }
        }
    }
});

//if the mouse is out of the canvas reset the game
canvas.cvs.addEventListener("mouseout", function () {
    if (isPlaying && isClicking) {
        failedTry();
    }
});

resetBtn.addEventListener("click", function () {
    failedTry();
    stopTimer();
    startTimer();
});


lobbyBtn.addEventListener("click", function () {
    if (gameMode === "speedrun") {
        stopTimer();
    }
    hideButtons();
    hideCanvas();
    failCross.style.display = "block";
    failCross.classList.remove("bounceOutDown");
    failCross.classList.add("bounceInDown");
    isPlaying = false;
    isClicking = false;
    setTimeout(function () {
        setTimeout(function () {
            failCross.style.display = "none";
            closeGame();
        }, 700);
        failCross.classList.remove("bounceInDown");
        failCross.classList.add("bounceOutDown");
    }, 1000);
});

colorPicker.forEach(function (color) {
    color.addEventListener("click", function () {
        colorPicker.forEach(function (color) {
            color.classList.remove("selected");
            color.classList.add("unselected");
        });
        userCellsColor = color.getAttribute("data-color");
        color.classList.add("selected");
        color.classList.remove("unselected");
    });
});


///////////
// UTILS //
///////////

/**
 * It hides the timer and buttons, then shows the nickname and color containers
 */
function UsernameDisplay() {
    timer.style.display = "none";
    timer.classList.remove("bounceInDown");
    buttonsContainer.classList.add("bounceOutDown");
    setTimeout(function () {
        buttonsContainer.classList.remove("bounceOutDown");
        buttonsContainer.style.display = "none";
        nicknameContainer.style.display = "flex";
        nicknameContainer.classList.add("bounceInDown");
        colorContainer.style.display = "flex";
        colorContainer.classList.add("bounceInDown");
        setTimeout(function () {
            nicknameContainer.classList.remove("bounceInDown");
            colorContainer.classList.remove("bounceInDown");
        }, 1000);
    }, 1000);
}


/**
 * `startGame()` initializes the grid, starts the timer, and generates the game
 */
function startGame() {
    initGrid(5);
    if (gameMode === "speedrun") {
        startTimer();
    }
    generateGame();
}

/**
 * It checks if the name is valid and if it is, it starts the game.
 */
function checkName() {
    if ((nicknameDiv.value !== "") && (nicknameDiv.value.length <= 15) && (nicknameDiv.value !== "speedrun") && (nicknameDiv.value !== "infinite")) {
        nickname = nicknameDiv.value;
        nicknameContainer.style.display = "none";
        nicknameContainer.classList.remove("bounceInDown");
        colorContainer.style.display = "none";
        colorContainer.classList.remove("bounceInDown");
        startGame();
    } else {
        nicknameContainer.classList.add("shake");
        colorContainer.classList.add("shake");
        setTimeout(function () {
            nicknameContainer.classList.remove("shake");
            colorContainer.classList.remove("shake");
        }, 0.5 * 1000);
    }
}

/**
 * It sets up the grid
 */
function initGrid(difficulty) {
    buttonsContainer.style.display = "none";
    levelDiv.style.display = "block";
    lobbyBtn.style.display = "block";
    resetBtn.style.display = "block";
    if (gameMode === "speedrun") {
        timer.style.display = "block";
    }
    isPlaying = true;
    currentDifficulty = difficulty;
    currentLevel = 0;
    canvas.cvs.attributes.width.value = 400;
    canvas.cvs.attributes.height.value = 400;
}

/**
 * It fills the canvas with white, draws a grid, clears the array of cells that have been drawn, and then draws a random
 * path
 */
function generateGame() {
    userClickedCells = [];
    currentLevel += 1;
    levelDiv.innerHTML = "Level " + currentLevel;
    updateScoreboard();
    if (gameMode === "speedrun") {
        if (currentLevel <= 5) {
            currentDifficulty = 5;
            } else if (currentLevel > 5 && currentLevel <= 10) {
                currentDifficulty = 6;
            } else if (currentLevel > 10 && currentLevel <= 15) {
                currentDifficulty = 8;
        } else if (currentLevel > 15) {
            if (localStorage.getItem("speedrun " + nickname) !== null) {
                if (timerValue < localStorage.getItem("speedrun " + nickname)) {
                    localStorage.setItem("speedrun " + nickname, timerValue);
                }
            } else {
                localStorage.setItem("speedrun " + nickname, timerValue);
            }
            updateScoreboard();
            closeGame();
        }
    } else if (gameMode === "infinite") {
        currentDifficulty = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
    }
    fillCanvas("#fff");
    drawGrid("#000", currentDifficulty, currentDifficulty, 1);
    randomPath();
}


/**
 * It closes the game by hiding the play button, stopping the timer, and setting the canvas width and height to 0
 */
function closeGame() {
    buttonsContainer.style.display = "flex";
    levelDiv.style.display = "none";
    lobbyBtn.style.display = "none";
    resetBtn.style.display = "none";
    timer.classList.add("bounceInDown")
    isPlaying = false;
    nickname = "";
    gameMode = "";
    stopTimer();
    hideCanvas();
}

/**
 * Fill the canvas with a color.
 * @param color - The color to fill the canvas with.
 */
function fillCanvas(color) {
    canvas.ctx.fillStyle = color;
    canvas.ctx.fillRect(0, 0, canvas.cvs.width, canvas.cvs.height);
}


/**
 * It draws a grid on the canvas
 * @param color - The color of the grid lines.
 * @param rows - The number of rows in the grid.
 * @param columns - The number of columns in the grid.
 * @param borderSize - The size of the border of the grid.
 */
function drawGrid(color, rows, columns, borderSize) {
    canvas.ctx.strokeStyle = color;
    canvas.ctx.lineWidth = borderSize;
    let width = canvas.cvs.width / columns;
    let height = canvas.cvs.height / rows;
    for (let i = 0; i < rows; i++) {
        canvas.ctx.beginPath();
        canvas.ctx.moveTo(0, i * height);
        canvas.ctx.lineTo(canvas.cvs.width, i * height);
        canvas.ctx.stroke();
    }
    for (let i = 0; i < columns; i++) {
        canvas.ctx.beginPath();
        canvas.ctx.moveTo(i * width, 0);
        canvas.ctx.lineTo(i * width, canvas.cvs.height);
        canvas.ctx.stroke();
    }
}


/**
 * It takes in the x and y coordinates of the mouse click and returns the row and column of the cell that was clicked
 * @param x - The x coordinate of the mouse click.
 * @param y - The y-coordinate of the mouse pointer
 * @returns The row and column of the cell that the user clicked on.
 */
function getCurrentCell(x, y) {
    let width = canvas.cvs.width / currentDifficulty;
    let height = canvas.cvs.height / currentDifficulty;
    let row = Math.floor(y / height);
    let column = Math.floor(x / width);
    return [row, column];
}


/**
 * If the user clicks on a cell that hasn't been clicked yet, then fill that cell with the color that was passed in
 * @param color - the color of the cell that the user clicked on
 */
function colorCellOnClick(color) {
    let cell = getCurrentCell(event.offsetX, event.offsetY);
    let width = canvas.cvs.width / currentDifficulty;
    let height = canvas.cvs.height / currentDifficulty;
    let row = cell[0];
    let column = cell[1];
    if (!drawnCells.some(cell => cell[0] === row && cell[1] === column)) { //fail if the cell is not the path
        failedTry();
    }
    if (!userClickedCells.some(cell => cell[0] === row && cell[1] === column)) {
        canvas.ctx.fillStyle = color;
        canvas.ctx.fillRect(column * width, row * height, width, height);
        userClickedCells.push(cell);
    } else { //fail if the cell is already clicked
        for (let i = 0; i < userClickedCells.length - 1; i++) {
            if (userClickedCells[i][0] === row && userClickedCells[i][1] === column) {
                if (!levelFinished) {
                    failedTry();
                }
            }
        }
    }
}


/**
 * It takes a row, column, and color, and then fills a rectangle with that color at the given row and column
 * @param row - The row of the cell to color.
 * @param column - The column of the cell to color.
 * @param color - The color to fill the cell with.
 */
function colorCell(row, column, color) {
    let width = canvas.cvs.width / currentDifficulty;
    let height = canvas.cvs.height / currentDifficulty;
    canvas.ctx.fillStyle = color;
    canvas.ctx.fillRect(column * width, row * height, width, height);
}


/**
 * It resets the canvas to its original state
 */
function resetCells() {
    userClickedCells = [];
    fillCanvas("#fff");
    drawGrid("#000", currentDifficulty, currentDifficulty, 1);
    for (let i = 0; i < drawnCells.length; i++) {
        colorCell(drawnCells[i][0], drawnCells[i][1], cellPathColor);
    }
}


/**
 * If the user fails to solve the puzzle, the grid is reset to 5x5 and a new puzzle is generated.
 */
function failedTry() {
    levelDiv.classList.add("shake");
    setTimeout(function () {
        levelDiv.classList.remove("shake");
    }, 0.5 * 1000);
    if (gameMode === "infinite") {
        console.log("Total level completed:", currentLevel - 1);
        if (localStorage.getItem("infinite " + nickname) !== null) {
            if (currentLevel-1 > localStorage.getItem("infinite " + nickname)) {
                localStorage.setItem("infinite " + nickname, currentLevel-1);
            }
        } else {
            localStorage.setItem("infinite " + nickname, currentLevel-1);
        }
        updateScoreboard();
    }
    initGrid(5);
    generateGame();
}


/**
 * It starts a timer that counts up in minutes and seconds, and displays the time in the timer element
 */
function startTimer() {
    timerRunning = true;
    timerValue = 0;
    timer.innerHTML = "00:00";
    timerInterval = setInterval(function () {
        timerValue++;
        let minutes = Math.floor(timerValue / 60);
        let seconds = timerValue % 60;
        if (seconds < 10) {
            seconds = "0" + seconds;
        }
        if (minutes < 10) {
            minutes = "0" + minutes;
        }
        timer.innerHTML = minutes + ":" + seconds;
    }, 1000);
}

/**
 * Stop the timer by clearing the timer interval.
 */
function stopTimer() {
    if (timerRunning) {
        clearInterval(timerInterval);
    }
    timerRunning = false;
}

/**
 * It returns a random cell in the grid
 * @returns An array with two elements, a random row and a random column.
 */
function getRandomCell() {
    let row = Math.floor(Math.random() * currentDifficulty);
    let column = Math.floor(Math.random() * currentDifficulty);
    return [row, column];
}


/**
 * It starts at a random cell, then checks the neighbors of the current cell, and if the neighbor hasn't been drawn yet, it
 * draws it and adds it to the list of drawn cells
 */
function randomPath() {
    drawnCells = [];
    let pathCount = Math.floor(currentDifficulty * currentDifficulty / 3);

    let startCell = getRandomCell();
    colorCell(startCell[0], startCell[1], cellPathColor);
    drawnCells.push(startCell);

    let n = 0;
    while (drawnCells.length < pathCount) {
        n++;
        let currentCell = drawnCells[drawnCells.length - 1];
        let neighbors = checkNeighbors(currentCell[0], currentCell[1]);
        let neighbor = neighbors[Math.floor(Math.random() * neighbors.length)];
        if (!drawnCells.some(cell => cell[0] === neighbor[0] && cell[1] === neighbor[1])) {
            drawnCells.push(neighbor);
            colorCell(neighbor[0], neighbor[1], cellPathColor);
        }
        if (n > pathCount * 2) {
            drawnCells = [];
            resetCells();
            randomPath();
            return;
        }
    }
}


/**
 * It returns an array of the coordinates of the neighbors of a given cell
 * @param row - the row of the cell we're checking
 * @param column - the column of the cell that was clicked
 * @returns An array of arrays.
 */
function checkNeighbors(row, column) {
    let neighbors = [];
    if (row > 0) {
        neighbors.push([row - 1, column]);
    }
    if (row < currentDifficulty - 1) {
        neighbors.push([row + 1, column]);
    }
    if (column > 0) {
        neighbors.push([row, column - 1]);
    }
    if (column < currentDifficulty - 1) {
        neighbors.push([row, column + 1]);
    }
    return neighbors;
}

/**
 * It takes two arrays of arrays, sorts them by the first element in each array, and then compares them to see if they are
 * equal
 */
function areArraysEqual(array1, array2) {
    array1.sort(function (a, b) {
        return a[0] - b[0] || a[1] - b[1];
    });
    array2.sort(function (a, b) {
        return a[0] - b[0] || a[1] - b[1];
    });
    const equals = (array1, array2) => JSON.stringify(array1) === JSON.stringify(array2);
    return equals(array1, array2);
}


/**
 * It sets the width and height of the canvas to 0
 */
function hideCanvas() {
    canvas.cvs.attributes.width.value = 0;
    canvas.cvs.attributes.height.value = 0;
}

/**
 * It hides buttons (play, level, reset & timer).
 */
function hideButtons() {
    buttonsContainer.style.display = "none";
    levelDiv.style.display = "none";
    lobbyBtn.style.display = "none";
    resetBtn.style.display = "none";
    timer.style.display = "none";
}

/**
 * It loops through all the items in localStorage, adds them to an array, sorts the array, and then adds the sorted array
 * to the scoreboard
 * @returns the value of the variable "scoreboardHTML".
 */
function updateScoreboard() {
    let localStorageArray = [];
    let scoreboardHTML = "Scoreboard";
    if (gameMode === "") {
        scoreboard.style.display = "none";
    } else {
        scoreboard.style.display = "flex";
    }
    if (gameMode === "speedrun") {
        if (Object.keys(localStorage).filter(key => key.includes("speedrun")).length === 0) {
            scoreboardHTML += `<div class="score">No scores yet</div>`;
        } else {
            for (let i = 0; i < localStorage.length; i++) {
                if (localStorage.key(i).includes("speedrun")) {
                    localStorageArray.push([localStorage.key(i).slice(9), localStorage.getItem(localStorage.key(i))]);
                }
            }
            localStorageArray.sort(function (a, b) {
                return a[1] - b[1];
            });
            let scoreboardDisplayLimit;
            if (localStorageArray.length > 5) {
                scoreboardDisplayLimit = 5;
            } else {
                scoreboardDisplayLimit = localStorageArray.length;
            }
            for (let i = 0; i < scoreboardDisplayLimit; i++) {
                let time = localStorageArray[i][1];
                if (localStorageArray[i][1] >= 60) {
                    time = Math.floor(localStorageArray[i][1] / 60) + "min " + (localStorageArray[i][1] % 60);
                }
                scoreboardHTML += `<div class="score">${i + 1} - ${localStorageArray[i][0]} : ${time} seconds</div>`;
            }
            let currentPlayerPosition = localStorageArray.findIndex(element => element[0] === "speedrun " + nickname);
            let totalPlayers = localStorage.length;
            if (currentPlayerPosition !== -1) {
                let userTime = localStorage.getItem("speedrun " + nickname);
                if (userTime >= 60) {
                    userTime = Math.floor(userTime / 60) + "min " + (userTime % 60);
                }
                scoreboardHTML += `<div class="your-position">Your position : ${currentPlayerPosition + 1}/${totalPlayers} with ${userTime} seconds</div>`;
            }
        }
    } else if (gameMode === "infinite") {
        if (Object.keys(localStorage).filter(key => key.includes("infinite")).length === 0) {
            scoreboardHTML += `<div class="score">No scores yet</div>`;
        } else {
            for (let i = 0; i < localStorage.length; i++) {
                if (localStorage.key(i).includes("infinite")) {
                    localStorageArray.push([localStorage.key(i).slice(9), localStorage.getItem(localStorage.key(i))]);
                }
            }
            localStorageArray.sort(function (a, b) {
                return b[1] - a[1];
            });
            let scoreboardDisplayLimit;
            if (localStorageArray.length > 5) {
                scoreboardDisplayLimit = 5;
            } else {
                scoreboardDisplayLimit = localStorageArray.length;
            }
            for (let i = 0; i < scoreboardDisplayLimit; i++) {
                let levels = localStorageArray[i][1];
                scoreboardHTML += `<div class="score">${i + 1} - ${localStorageArray[i][0]} : ${levels} levels</div>`;
            }
            let currentPlayerPosition = localStorageArray.findIndex(element => element[0] === "infinite " + nickname);
            let totalPlayers = localStorage.length;
            if (currentPlayerPosition !== -1) {
                let userLevels = localStorage.getItem("infinite " + nickname);
                scoreboardHTML += `<div class="your-position">Your position : ${currentPlayerPosition + 1}/${totalPlayers} with ${userLevels} levels</div>`;
            }
        }
    }
    scoreboard.innerHTML = scoreboardHTML;
}