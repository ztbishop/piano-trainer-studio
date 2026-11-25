// Used by the browser regressions to exercise the same Scores menu as a player.
exports.openPdfMenu = async function (page) {
    await page.locator('#scores-panel.is-closing').waitFor({state:'hidden'});
    if (!await page.locator('#scores-panel').isVisible()) await page.locator('#btn-scores').click();
    await page.locator('.scores-tools summary', {hasText:/^PDF$/}).click();
};
