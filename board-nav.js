// Board button event listener
const boardBtn = document.getElementById('board-btn');
if (boardBtn) {
    boardBtn.addEventListener('click', function () {
        window.location.href = './board.html';
    });
}
