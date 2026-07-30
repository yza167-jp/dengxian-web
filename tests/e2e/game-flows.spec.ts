import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const SCREENSHOT_DIR = resolve('docs/screenshots');

async function clickAction(page: Page, name?: RegExp): Promise<boolean> {
  const dock = page.getByLabel('合法动作');
  const button = name
    ? dock.getByRole('button', { name }).first()
    : dock.getByRole('button').first();
  if ((await button.count()) === 0 || !(await button.isVisible().catch(() => false))) return false;
  await button.click();
  const confirm = dock.getByRole('button', { name: /确认行动/ });
  if ((await confirm.count()) > 0 && await confirm.isEnabled().catch(() => false)) {
    await confirm.click();
  }
  // UI command handlers are intentionally fire-and-forget; allow the
  // authoritative snapshot to replace the clicked revision before acting again.
  await page.waitForTimeout(150);
  return true;
}

async function clickPreferredAction(page: Page): Promise<boolean> {
  const preferred = [
    /锁定谈判准备/,
    /修台 1/,
    /抗劫 1/,
    /修炼 1/,
    /探索机缘/,
    /按基础规则抽牌/,
    /保留/,
    /接受该效果/,
    /跳过/,
    /继续一轮/,
    /暂不破界/,
    /弃置/,
  ];
  for (const label of preferred) {
    if (await clickAction(page, label)) return true;
  }
  return clickAction(page);
}

async function startSolo(page: Page, seed: string): Promise<void> {
  await page.goto('/solo');
  await page.getByLabel('玩家名').fill(`验局-${seed}`);
  await page.getByLabel('Seed').fill(seed);
  await page.getByRole('button', { name: '入坛开局' }).click();
  await expect(page.getByLabel('游戏桌面')).toBeVisible();
  await expect(page.locator('.phase-orb span').filter({ hasText: '第 1 轮' })).toBeVisible();
}

async function advanceUntilRoundTwo(page: Page): Promise<void> {
  for (let step = 0; step < 36; step += 1) {
    if (await page.getByText(/第 2 轮|飞升结算|仙台崩裂/).first().isVisible().catch(() => false)) return;
    const acted = await clickPreferredAction(page);
    if (!acted) await page.waitForTimeout(150);
  }
  await expect(page.getByText(/第 2 轮|飞升结算|仙台崩裂/).first()).toBeVisible();
}

async function advanceToOutcome(page: Page): Promise<void> {
  for (let step = 0; step < 600; step += 1) {
    if (page.url().endsWith('/outcome')) return;
    const acted = await clickPreferredAction(page);
    if (!acted) {
      await page.waitForTimeout(20);
    }
  }
  await expect(page).toHaveURL(/\/outcome$/);
}

async function createOnlineHost(page: Page, seed: string): Promise<string> {
  await page.goto('/online');
  await page.getByLabel('房主名').fill(`房主-${seed}`);
  await page.getByRole('button', { name: '创建房间' }).click();
  const strip = page.locator('.info-strip', { hasText: '房间码' }).first();
  await expect(strip).toBeVisible();
  const text = await strip.textContent();
  const code = text?.match(/房间码\s+([A-Z0-9-]{4,12})/)?.[1];
  expect(code, `room code in ${text ?? '<empty>'}`).toBeTruthy();
  return code!;
}

async function addBotsAndStart(host: Page, guest: Page): Promise<void> {
  await host.getByRole('button', { name: '添加 AI' }).click();
  await host.getByRole('button', { name: '添加 AI' }).click();
  await expect(host.locator('.seat-list article')).toHaveCount(4);
  await host.getByRole('button', { name: '准备' }).click();
  await guest.getByRole('button', { name: '准备' }).click();
  await host.getByRole('button', { name: '开始对局' }).click();
  await expect(host.getByLabel('游戏桌面')).toBeVisible();
  await expect(guest.getByLabel('游戏桌面')).toBeVisible();
}

async function advanceSharedRound(host: Page, guest: Page): Promise<void> {
  for (let step = 0; step < 80; step += 1) {
    const done = await host.getByText(/第 2 轮|飞升结算|仙台崩裂/).first().isVisible().catch(() => false);
    if (done) return;
    if (await clickPreferredAction(host)) continue;
    if (await clickPreferredAction(guest)) continue;
    await host.waitForTimeout(200);
  }
  await expect(host.getByText(/第 2 轮|飞升结算|仙台崩裂/).first()).toBeVisible();
}

async function saveScreenshot(page: Page, path: string): Promise<void> {
  const absolute = resolve(SCREENSHOT_DIR, path);
  await mkdir(dirname(absolute), { recursive: true });
  await page.screenshot({ path: absolute, fullPage: true });
}

test.describe('local play', () => {
  test('starts a solo game and advances through at least one full round', async ({ page }) => {
    await startSolo(page, '101');
    await advanceUntilRoundTwo(page);
  });

  test('starts a server-authoritative Provider solo room and falls back without blocking', async ({ page }) => {
    await page.goto('/solo');
    await page.getByLabel('玩家名').fill('Provider 验局');
    await page.getByLabel('Seed').fill('105');
    await page.getByLabel('你的角色').selectOption('R07');
    await page.getByLabel('AI Provider').selectOption('deepseek');
    await page.getByRole('button', { name: '入坛开局' }).click();
    await expect(page.getByLabel('游戏桌面')).toBeVisible();
    await expect(page.getByText('邪修').first()).toBeVisible();
    await clickPreferredAction(page);
    await page.getByRole('button', { name: /^会话/ }).click();
    await expect(page.getByLabel('公开会话抽屉')).toContainText(/本地 Bot 接管|公开局势/);
  });

  test('continues the most recent solo game from the main menu', async ({ page }) => {
    await startSolo(page, '102');
    await page.goto('/');
    await page.getByRole('button', { name: '继续最近单人局' }).click();
    await expect(page.getByLabel('游戏桌面')).toBeVisible();
  });

  test('keeps records and chat secondary in dismissible edge drawers', async ({ page }) => {
    await startSolo(page, '104');
    await expect(page.getByLabel('对局记录抽屉')).toHaveCount(0);

    await page.getByRole('button', { name: /^记录/ }).click();
    await expect(page.getByLabel('对局记录抽屉')).toBeVisible();

    await page.getByRole('button', { name: '关闭侧边抽屉' }).click();
    await expect(page.getByLabel('对局记录抽屉')).toHaveCount(0);

    await page.getByRole('button', { name: /^会话/ }).click();
    await expect(page.getByLabel('公开会话抽屉')).toBeVisible();
  });

  test('completes a full local-bot game and renders the terminal settlement', async ({ page }) => {
    test.setTimeout(90_000);
    await startSolo(page, '103');
    await advanceToOutcome(page);
    await expect(page.getByRole('heading', { name: '飞升结算' })).toBeVisible();
    await expect(page.locator('.ranking, .defeat')).toBeVisible();
  });
});

test.describe('saves', () => {
  test('saves, exports, deletes, imports, and loads a named local save', async ({ page }) => {
    await startSolo(page, '201');
    await page.getByRole('link', { name: '存档' }).click();
    await page.getByLabel('存档名').fill('E2E 命名存档');
    await page.getByRole('button', { name: '保存当前单人局' }).click();
    const saveRow = page.locator('article', { hasText: 'E2E 命名存档' }).first();
    await expect(saveRow).toBeVisible();

    await saveRow.getByRole('button', { name: '导出' }).click();
    const payload = page.getByLabel('导入导出存档');
    await expect(payload).toHaveValue(/"schemaVersion": 1/);
    const exported = await payload.inputValue();

    await saveRow.getByRole('button', { name: '删除' }).click();
    await expect(page.locator('article', { hasText: 'E2E 命名存档' })).toHaveCount(0);

    await payload.fill(exported);
    await page.getByRole('button', { name: '导入 / 覆盖' }).click();
    const importedRow = page.locator('article', { hasText: 'E2E 命名存档' }).first();
    await expect(importedRow).toBeVisible();
    await importedRow.getByRole('button', { name: '载入' }).click();
    await expect(page.locator('footer')).toContainText('已载入');
    await page.goto('/');
    await page.getByRole('button', { name: '继续最近单人局' }).click();
    await expect(page.getByLabel('游戏桌面')).toBeVisible();
  });
});

test.describe('online play', () => {
  test('lets two browser contexts create, join, start, and advance one shared round', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    try {
      const code = await createOnlineHost(host, '301');
      await guest.goto('/online');
      await guest.getByLabel('房间码').fill(code);
      await guest.getByLabel('显示名').fill('客席-301');
      await guest.getByRole('button', { name: '凭座位令牌加入' }).click();
      await expect(guest.getByLabel('房间席位')).toContainText(code);
      await host.locator('.seat-list article', { hasText: '客席-301' }).getByRole('button', { name: '与我换座' }).click();
      await expect(host.locator('.seat-list article').first()).toContainText('客席-301');
      await expect(guest.locator('.seat-list article').first()).toContainText('客席-301');
      await addBotsAndStart(host, guest);
      await expect(host.getByText(/剩余 \d+ 秒/)).toBeVisible();
      await advanceSharedRound(host, guest);
      await expect(guest.getByLabel('游戏桌面')).toBeVisible();
      await guest.reload();
      await expect(guest.getByLabel('游戏桌面')).toBeVisible();
      await expect(guest.getByText(/第 2 轮|飞升结算|仙台崩裂/).first()).toBeVisible();
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});

test.describe('reference routes', () => {
  test('shows the tutorial rule path', async ({ page }) => {
    await page.goto('/tutorial');
    await expect(page.getByRole('heading', { name: '八轮天劫，有限席位' })).toBeVisible();
    await expect(page.getByRole('img', { name: /规则展示图/ })).toHaveCount(3);
  });

  test('shows the outcome route before a terminal game exists', async ({ page }) => {
    await page.goto('/outcome');
    await expect(page.getByRole('heading', { name: '飞升结算' })).toBeVisible();
    await expect(page.getByText('尚未产生终局。')).toBeVisible();
  });
});

test.describe('release screenshots', () => {
  test('captures representative responsive screenshots', async ({ browser }) => {
    const shots: Array<{ width: number; height: number; route: string; name: string }> = [
      { width: 1024, height: 768, route: '/', name: 'menu-1024x768.png' },
      { width: 1280, height: 720, route: '/tutorial', name: 'tutorial-1280x720.png' },
      { width: 1440, height: 900, route: '/game', name: 'table-1440x900.png' },
      { width: 1920, height: 1080, route: '/saves', name: 'saves-1920x1080.png' },
    ];
    for (const shot of shots) {
      const context = await browser.newContext({ viewport: { width: shot.width, height: shot.height } });
      const page = await context.newPage();
      if (shot.route === '/game' || shot.route === '/saves') {
        await startSolo(page, `${shot.width}`);
        if (shot.route === '/saves') await page.getByRole('link', { name: '存档' }).click();
      } else {
        await page.goto(shot.route);
      }
      if (shot.route === '/game') await expect(page.getByLabel('游戏桌面')).toBeVisible();
      if (shot.route === '/saves') await expect(page.getByRole('heading', { name: '存档', exact: true })).toBeVisible();
      await saveScreenshot(page, shot.name);
      await context.close();
    }
  });
});
