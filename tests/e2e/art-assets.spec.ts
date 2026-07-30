import { expect, test, type Page } from '@playwright/test';

async function startSolo(page: Page, seed: string): Promise<void> {
  await page.goto('/solo');
  await page.getByLabel('玩家名').fill(`美术验收-${seed}`);
  await page.getByLabel('Seed').fill(seed);
  await page.getByRole('button', { name: '入坛开局' }).click();
  await expect(page.getByLabel('游戏桌面')).toBeVisible();
}

async function advanceToSecretPlanning(page: Page): Promise<void> {
  const actionDock = page.getByLabel('合法动作');
  for (let step = 0; step < 12; step += 1) {
    if (await actionDock.getByRole('button', { name: /探索机缘/ }).first().isVisible().catch(() => false)) return;
    const next = actionDock.getByRole('button', { name: /跳过|锁定谈判准备/ }).first();
    if ((await next.count()) === 0) break;
    await next.click();
    await page.waitForTimeout(120);
  }
  await expect(actionDock.getByRole('button', { name: /探索机缘/ }).first()).toBeVisible();
}

async function expectImagesLoaded(locator: ReturnType<Page['locator']>, expectedCount: number): Promise<void> {
  await expect(locator).toHaveCount(expectedCount);
  const loaded = await locator.evaluateAll((images) =>
    images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
  );
  expect(loaded).toBe(true);
}

test.describe('upstream art usage', () => {
  test('uses the responsive upstream cover artwork on the main menu', async ({ browser }) => {
    const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await desktop.goto('/');
      await mobile.goto('/');

      const desktopHero = desktop.locator('.mofa-hero-art img');
      const mobileHero = mobile.locator('.mofa-hero-art img');
      await expectImagesLoaded(desktopHero, 1);
      await expectImagesLoaded(mobileHero, 1);
      const desktopHeroArt = await desktopHero.evaluate((image) => (image as HTMLImageElement).currentSrc);
      const mobileHeroArt = await mobileHero.evaluate((image) => (image as HTMLImageElement).currentSrc);

      expect(desktopHeroArt).toMatch(/01-[^-]+-941\.webp$/);
      expect(mobileHeroArt).toMatch(/01-[^-]+-720\.webp$/);
    } finally {
      await desktop.close();
      await mobile.close();
    }
  });

  test('gives tutorial rule artwork meaningful accessible names', async ({ page }) => {
    await page.goto('/tutorial');

    await expectImagesLoaded(page.getByRole('img', { name: /末法世界/ }), 1);
    await expectImagesLoaded(page.getByRole('img', { name: /共同修台/ }), 1);
    await expectImagesLoaded(page.getByRole('img', { name: /秘密四选一/ }), 1);
    await expect(page.getByRole('img', { name: /^规则展示图 \d$/ })).toHaveCount(0);
  });

  test('opens tutorial rule artwork in an accessible lightbox', async ({ page }) => {
    await page.goto('/tutorial');

    await page.getByRole('img', { name: /秘密四选一/ }).click();

    const dialog = page.getByRole('dialog', { name: /秘密四选一/ });
    await expect(dialog).toBeVisible();
    await expectImagesLoaded(dialog.getByRole('img', { name: /秘密四选一/ }), 1);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('shows loaded character portrait artwork for every public player token', async ({ page }) => {
    await startSolo(page, '610');

    const playerTokens = page.getByLabel('玩家公开状态').locator('.player-token');
    const tokenCount = await playerTokens.count();
    expect(tokenCount).toBeGreaterThanOrEqual(4);
    await expectImagesLoaded(playerTokens.locator('img[alt*="画像"], img[alt*="角色"], img[alt*="修士"], img[alt*="头像"]'), tokenCount);
  });

  test('shows loaded plan-action artwork for all four secret choices', async ({ page }) => {
    await startSolo(page, '611');
    await advanceToSecretPlanning(page);
    const actionDock = page.getByLabel('合法动作');

    const planButtons = [
      actionDock.getByRole('button', { name: /修炼/ }).first(),
      actionDock.getByRole('button', { name: /修台/ }).first(),
      actionDock.getByRole('button', { name: /抗劫/ }).first(),
      actionDock.getByRole('button', { name: /探索/ }).first(),
    ];
    for (const button of planButtons) {
      await expect(button).toBeVisible();
      await expectImagesLoaded(button.locator('img'), 1);
    }
  });

  test('serves all rendered art assets without broken production responses', async ({ page }) => {
    const failedAssets: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/assets/') && response.status() >= 400) failedAssets.push(`${response.status()} ${url}`);
    });
    page.on('requestfailed', (request) => {
      const url = request.url();
      if (url.includes('/assets/')) failedAssets.push(`${request.failure()?.errorText ?? 'failed'} ${url}`);
    });

    await page.goto('/');
    await page.goto('/tutorial');
    await startSolo(page, '612');

    const brokenRenderedImages = await page.locator('img').evaluateAll((images) =>
      images
        .filter((image): image is HTMLImageElement => image instanceof HTMLImageElement)
        .filter((image) => !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0)
        .map((image) => image.currentSrc || image.src || image.alt),
    );

    expect(failedAssets).toEqual([]);
    expect(brokenRenderedImages).toEqual([]);
  });
});
