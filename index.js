let playBtn = document.querySelector("#play");
let resetBtn = document.querySelector("#reset");

let canvas = {
    cvs: document.querySelector(".grid"),
    ctx: document.querySelector(".grid").getContext('2d'),
}

let isPlaying = false;


playBtn.addEventListener("click", function (event) {
    console.clear();
    isPlaying = true;
    canvas.cvs.attributes.width.value = 400;
    canvas.cvs.attributes.height.value = 400;
    fillCanvas("#fff");
    drawGrid("#000", 5, 5, 1);

});

//event listener to mouse to get the position of the mouse
canvas.cvs.addEventListener("mousemove", function (event) {
    if (isPlaying) {
        let x = event.offsetX;
        let y = event.offsetY;
        getCurrentCell(x, y);
    }
});


resetBtn.addEventListener("click", function (event) {
});

///////////
// UTILS //
///////////

//fillCanvas function to fill the canvas with a color
function fillCanvas(color) {
    canvas.ctx.fillStyle = color;
    canvas.ctx.fillRect(0, 0, canvas.cvs.width, canvas.cvs.height);
}

//drawGrid function to draw the grid on the canvas
//parameters: color, number of rows, number of columns, border size
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

//getCurrentCell function to get the current cell
function getCurrentCell(x, y) {
    let width = canvas.cvs.width / 5;
    let height = canvas.cvs.height / 5;
    let row = Math.floor(y / height);
    let column = Math.floor(x / width);
    console.log("Row : ", row + 1, "Column : " ,column + 1);
    return [row + 1, column + 1];
}
