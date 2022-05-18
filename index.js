let playBtn = document.querySelector("#play");
let resetBtn = document.querySelector("#reset");
let timer = document.querySelector(".timer");

let canvas = {
    cvs: document.querySelector(".grid"),
    ctx: document.querySelector(".grid").getContext('2d'),
}

let isPlaying = false;
let isClicking = false;

let timerValue = 0;
let currentDifficulty = 0; // 0 = not playing, 5 = easy, 6 = medium, 8 = hard


playBtn.addEventListener("click", function (event) {
    console.clear();
    playBtn.style.display = "none";
    isPlaying = true;
    timer.style.display = "block";
    currentDifficulty = 5;
    startTimer();
    canvas.cvs.attributes.width.value = 400;
    canvas.cvs.attributes.height.value = 400;
    fillCanvas("#fff");
    drawGrid("#000", currentDifficulty, currentDifficulty, 1);

});

window.addEventListener("mousedown", function (event) {
    if (isPlaying) {
        isClicking = true;
    }
});

window.addEventListener("mouseup", function (event) {
    if (isPlaying) {
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
            colorCell("#000")
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
    playBtn.style.display = "block";
    isPlaying = false;
    stopTimer();
    canvas.cvs.attributes.width.value = 0;
    canvas.cvs.attributes.height.value = 0;
});

///////////
// UTILS //
///////////


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
function colorCell(color) {
    let cell = getCurrentCell(event.offsetX, event.offsetY);
    let width = canvas.cvs.width / 5;
    let height = canvas.cvs.height / 5;
    let row = cell[0] - 1;
    let column = cell[1] - 1;
    canvas.ctx.fillStyle = color;
    canvas.ctx.fillRect(column * width, row * height, width, height);
}


/**
 * It resets the canvas to its original state
 */
function resetCells() {
    fillCanvas("#fff");
    drawGrid("#000", currentDifficulty, currentDifficulty, 1);
}

//startTimer displays the timer on the screen (minutes:seconds)
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

function stopTimer() {
    clearInterval(timerInterval);
}
