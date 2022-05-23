let playBtn = document.querySelector("#play");
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

let drawnCells = [];
let userClickedCells = [];

let timerValue = 0;
let currentDifficulty = 0; // 0 = not playing, 5 = easy, 6 = medium, 8 = hard
let levelsCount = 15;
let currentLevel = 0;

let cellPathColor = "rgba(252,225,18,0.3)"
let userCellsColor = "rgba(243,75,47,0.2)";
let nickname = "";

window.addEventListener("load", updateScoreboard);

playBtn.addEventListener("click", function () {
    timer.style.display = "none";
    timer.classList.remove("bounceInDown");
    playBtn.classList.add("bounceOutDown");
    setTimeout(function () {
        playBtn.classList.remove("bounceOutDown");
        playBtn.style.display = "none";
        nicknameContainer.style.display = "flex";
        nicknameContainer.classList.add("bounceInDown");
        colorContainer.style.display = "flex";
        colorContainer.classList.add("bounceInDown");
        setTimeout(function () {
            nicknameContainer.classList.remove("bounceInDown");
            colorContainer.classList.remove("bounceInDown");
        }, 1000);
    }, 1000);
});

window.addEventListener("keydown", function (event) {
    if (event.keyCode === 13) {
        if (nicknameContainer.style.display === "flex") {
            checkName();
        }
    }
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
            if (currentLevel > levelsCount) {
                closeGame();
                return;
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
                console.log("userClickedCells", userClickedCells);
                console.log("drawnCells", drawnCells);
                if (areArraysEqual(userClickedCells, drawnCells)) {
                    levelFinished = true;
                    console.log("Level finished");
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
    console.clear();
    stopTimer();
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
 * `startGame()` clears the console, initializes the grid, starts the timer, and generates the game
 */
function startGame() {
    console.clear();
    initGrid(5);
    startTimer();
    generateGame();
}

/**
 * It checks if the name is valid and if it is, it starts the game.
 */
function checkName() {
    if ((nicknameDiv.value !== "") && (nicknameDiv.value.length <= 15)) {
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
    playBtn.style.display = "none";
    levelDiv.style.display = "block";
    resetBtn.style.display = "block";
    isPlaying = true;
    timer.style.display = "block";
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
    if (currentLevel <= 5) {
        currentDifficulty = 5;
    } else if (currentLevel > 5 && currentLevel <= 10) {
        currentDifficulty = 6;
    } else if (currentLevel > 10 && currentLevel <= 15) {
        currentDifficulty = 8;
    } else if (currentLevel > 15) {
        if (localStorage.getItem(nickname) !== null) {
            if (timerValue < localStorage.getItem(nickname)) {
                localStorage.setItem(nickname, timerValue);
            }
        } else {
            localStorage.setItem(nickname, timerValue);
        }
        updateScoreboard();
        closeGame();
    }
    fillCanvas("#fff");
    drawGrid("#000", currentDifficulty, currentDifficulty, 1);
    randomPath();
}


/**
 * It closes the game by hiding the play button, stopping the timer, and setting the canvas width and height to 0
 */
function closeGame() {
    playBtn.style.display = "block";
    levelDiv.style.display = "none";
    resetBtn.style.display = "none";
    timer.classList.add("bounceInDown")
    isPlaying = false;
    nickname = "";
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
    initGrid(5);
    generateGame();
}


/**
 * It starts a timer that counts up in minutes and seconds, and displays the time in the timer element
 */
function startTimer() {
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
    clearInterval(timerInterval);
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
    console.log("Paths Drawn : ", pathCount);

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
    console.log("Path : ", drawnCells, "Length : ", drawnCells.length);
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
    playBtn.style.display = "none";
    levelDiv.style.display = "none";
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
    if (localStorage.length === 0) {
        scoreboardHTML += `<div class="score">No scores yet</div>`;
    } else {
        for (let i = 0; i < localStorage.length; i++) {
            localStorageArray.push([localStorage.key(i), localStorage.getItem(localStorage.key(i))]);
        }
        localStorageArray.sort(function (a, b) {
            return a[1] - b[1];
        });
        if (localStorageArray.length > 5) {
            localStorageArray.length = 5;
        }
        for (let i = 0; i < localStorageArray.length; i++) {
            let time = localStorageArray[i][1];
            if (localStorageArray[i][1] >= 60) {
                time = Math.floor(localStorageArray[i][1] / 60) + "min " + (localStorageArray[i][1] % 60);
            }
            scoreboardHTML += `<div class="score">${i + 1} - ${localStorageArray[i][0]} : ${time} seconds</div>`;
        }
        let currentPlayerPosition = localStorageArray.findIndex(element => element[0] === nickname);
        let totalPlayers = localStorage.length;
        console.log(currentPlayerPosition);
        if (currentPlayerPosition !== -1) {
            scoreboardHTML += `<div class="your-position">Your position : ${currentPlayerPosition + 1}/${totalPlayers} with ${timerValue} seconds</div>`;
        }
    }
    scoreboard.innerHTML = scoreboardHTML;
}