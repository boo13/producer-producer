(function () {
    const canvas = document.getElementById('space-invader');
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const frames = [
        [
            '................',
            '................',
            '................',
            '...##########...',
            '...##########...',
            '...##########...',
            '...##.####.##...',
            '#####.####.#####',
            '#..##########..#',
            '#..##########..#',
            '#..##########..#',
            '...##########...',
            '.....#....#.....',
            '.....#....#.....',
            '.....#....#.....',
            '....##....##....',
        ],
        [
            '................',
            '................',
            '................',
            '...##########...',
            '#..##########..#',
            '#..##########..#',
            '#..##.####.##..#',
            '#####.####.#####',
            '...##########...',
            '...##########...',
            '...##########...',
            '...##########...',
            '.....#....#.....',
            '.....#....#.....',
            '.....#....#.....',
            '....##....##....',
        ],
    ];

    const cols = frames[0][0].length;
    const rows = frames[0].length;
    const pixel = canvas.width / cols;
    const color = '#f8f8f0';

    const drawFrame = (frame) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = color;
        frame.forEach((pattern, rowIndex) => {
            [...pattern].forEach((char, column) => {
                if (char === '#') {
                    ctx.fillRect(column * pixel, rowIndex * pixel, pixel, pixel);
                }
            });
        });
    };

    let currentFrame = 0;
    drawFrame(frames[currentFrame]);

    setInterval(() => {
        currentFrame = (currentFrame + 1) % frames.length;
        drawFrame(frames[currentFrame]);
    }, 600);
})();
