let playBtn = document.querySelector("#play");
let resetBtn = document.querySelector("#reset");
let timer = document.querySelector(".timer");

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

let cellPathColor = "#9a7999"


playBtn.addEventListener("click", function (event) {
    console.clear();
    initGrid(5);
    generateGame();
});

window.addEventListener("mousedown", function (event) {
    if (isPlaying) {
        isClicking = true;
    }
});

window.addEventListener("mouseup", function (event) {
    if (isPlaying) {
        if(levelFinished) {
            if(currentLevel > levelsCount) {
                closeGame();
                return;
            }
            levelFinished = false;
            isClicking = false;
            generateGame();
            return;
        }
        resetCells();
        isClicking = false;
    }
});


canvas.cvs.addEventListener("mousemove", function (event) {
    if (isClicking) {
        if (isPlaying) {
            let x = event.offsetX;
            let y = event.offsetY;
            getCurrentCell(x, y);
            colorCellOnClick("#000")
            if (userClickedCells.length === drawnCells.length) {
                for (let i = 0; i < userClickedCells.length; i++) {
                    if (drawnCells.some(cell => cell[0] === userClickedCells[i][0] && cell[1] === userClickedCells[i][1])) {
                        levelFinished = true;
                    }
                }
            }
        }
    }
});

//if the mouse is out of the canvas resetCells
canvas.cvs.addEventListener("mouseout", function (event) {
    if (isPlaying) {
        resetCells();
    }
});



resetBtn.addEventListener("click", function (event) {
    console.clear();
    closeGame();
});


///////////
// UTILS //
///////////

/**
 * It sets up the grid
 */
function initGrid(difficulty) {
    playBtn.style.display = "none";
    isPlaying = true;
    timer.style.display = "block";
    currentDifficulty = difficulty;
    startTimer();
    canvas.cvs.attributes.width.value = 400;
    canvas.cvs.attributes.height.value = 400;
}

/**
 * It fills the canvas with white, draws a grid, clears the array of cells that have been drawn, and then draws a random
 * path
 */
function generateGame() {
    currentLevel += 1;
    if (currentLevel > 5 && currentLevel < 10) {
        currentDifficulty = 5;
    } else if (currentLevel > 10 && currentLevel < 15) {
        currentDifficulty = 6;
    } else if (currentLevel > 15) {
        currentDifficulty = 8;
    }
    drawnCells = [];
    fillCanvas("#fff");
    drawGrid("#000", currentDifficulty, currentDifficulty, 1);
    randomPath();
}

/**
 * It closes the game by hiding the play button, stopping the timer, and setting the canvas width and height to 0
 */
function closeGame() {
    playBtn.style.display = "block";
    isPlaying = false;
    stopTimer();
    canvas.cvs.attributes.width.value = 0;
    canvas.cvs.attributes.height.value = 0;
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
    let width = canvas.cvs.width / 5;
    let height = canvas.cvs.height / 5;
    let row = Math.floor(y / height);
    let column = Math.floor(x / width);
    console.log("Row : ", row + 1, "Column : " ,column + 1);
    return [row + 1, column + 1];
}


/**
 * It takes a color and fills the cell that the user clicked on with that color
 * @param color - the color to fill the cell with
 */
function colorCellOnClick(color) {
    let cell = getCurrentCell(event.offsetX, event.offsetY);
    let width = canvas.cvs.width / currentDifficulty;
    let height = canvas.cvs.height / currentDifficulty;
    let row = cell[0] - 1;
    let column = cell[1] - 1;
    canvas.ctx.fillStyle = color;
    canvas.ctx.fillRect(column * width, row * height, width, height);
    //push cell to userClickedCells array if it is not already in there (using some and getCurrentCell)
    if (!userClickedCells.some(cell => cell[0] === row + 1 && cell[1] === column + 1)) {
        userClickedCells.push(cell);
        console.log("USER CICKED", userClickedCells, "length : ", userClickedCells.length);
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
    fillCanvas("#fff");
    drawGrid("#000", currentDifficulty, currentDifficulty, 1);
    for (let i = 0; i < drawnCells.length; i++) {
        colorCell(drawnCells[i][0], drawnCells[i][1], cellPathColor);
    }
    userClickedCells = [];
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

function getRandomCell() {
    let row = Math.floor(Math.random() * currentDifficulty);
    let column = Math.floor(Math.random() * currentDifficulty);
    return [row, column];
}


function randomPath() {
    let pathCount = Math.floor(currentDifficulty * currentDifficulty / 3);
    console.log("Paths Drawn : ", pathCount);

    let startCell = getRandomCell();

    console.log("Start Cell : ", startCell);
    console.log("Row : ", startCell[0], "Column : ", startCell[1]);
    colorCell(startCell[0], startCell[1], cellPathColor);

    drawnCells.push(startCell);
    while (drawnCells.length < pathCount) {
        let currentCell = drawnCells[drawnCells.length - 1];
        let neighbors = checkNeighbors(currentCell[0], currentCell[1]);
        console.log("Neighbors : ", neighbors);
        let neighbor = neighbors[Math.floor(Math.random() * neighbors.length)]; //todo: optimize this
        if (!drawnCells.some(cell => cell[0] === neighbor[0] && cell[1] === neighbor[1])) {
            drawnCells.push(neighbor);
            colorCell(neighbor[0], neighbor[1], cellPathColor);
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