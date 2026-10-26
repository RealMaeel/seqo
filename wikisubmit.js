// SEQO - posting your observed drop rates to the wiki (main process).
// Extracted from main.js in v2.7 with the code unchanged, except that settings are
// read through a getter; main.js wires it up and keeps the IPC handler.
// ---------------------------------------------------------------------------
// Wiki submission: post observed drop rates using the user's bot password.
// mode 'sandbox': one page (User:<name>/SEQO Drop Data), replaced wholesale.
// mode 'talk': a new dated section on each mob's talk page.
// ---------------------------------------------------------------------------

// deps: getSettings(), updater (updater.js: wikiLogin, getCsrfToken, wikiEdit, WIKI_PAGE),
//       getWin() -> overlay or null, sleep(ms) (tests pass a fast one)
function create({ getSettings, updater, getWin, sleep: wait = (ms) => new Promise(r => setTimeout(r, ms)) }) {
  async function wikiSubmit({ mode, fullText, perMob }) {
    if (!getSettings().wikiUser || !getSettings().wikiPass) {
      return { error: 'Set your wiki username and bot password in Settings first' };
    }
    try {
      const realUser = await updater.wikiLogin(getSettings().wikiUser, getSettings().wikiPass);
      const csrf = await updater.getCsrfToken();
      const sleep = wait;

      if (mode === 'sandbox') {
        const title = 'User:' + realUser + '/SEQO Drop Data';
        await updater.wikiEdit({ title, text: fullText, csrf });
        return { edited: 1, url: updater.WIKI_PAGE(title), user: realUser };
      }

      // talk pages: one new section per mob, politely rate-limited
      const results = [];
      let edited = 0;
      const date = new Date().toISOString().slice(0, 10);
      for (const m of (perMob || []).slice(0, 30)) {
        try {
          const title = 'Talk:' + m.mob.charAt(0).toUpperCase() + m.mob.slice(1);
          await updater.wikiEdit({
            title, text: m.text + '\n~~~~',
            newSectionTitle: 'Observed drop rates (SEQO, ' + date + ')',
            csrf
          });
          edited++;
          results.push(m.mob + ' ✓');
        } catch (err) {
          results.push(m.mob + ' ⚠ ' + err.message);
        }
        { const win = getWin(); if (win) win.webContents.send('wiki-submit-progress', { done: results.length, total: Math.min((perMob || []).length, 30) }); }
        await sleep(1800);
      }
      return { edited, results, user: realUser };
    } catch (err) {
      return { error: err.message };
    }
  }

  return { wikiSubmit };
}

module.exports = { create };
