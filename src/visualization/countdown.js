export function getCountdown(windowStart, windowEnd) {
    const now = new Date();
    const start = new Date(windowStart);
    const end = new Date(windowEnd);

    if (now >= start && now <= end) {
        return {
            status: "open"
        };
    }

    if (now > end) {
        return {
            status: "closed"
        };
    }

    const timeLeft = start - now;

    const days = Math.floor(
        timeLeft / (1000 * 60 * 60 * 24)
    );

    const hours = Math.floor(
        (timeLeft / (1000 * 60 * 60)) % 24
    );

    const minutes = Math.floor(
        (timeLeft / (1000 * 60)) % 60
    );

    const seconds = Math.floor(
        (timeLeft / 1000) % 60
    );

    return {
        status: "countdown",
        days,
        hours,
        minutes,
        seconds
    };
}