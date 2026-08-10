import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

# DOMAIN-02 + soft-delete: ContactFormDialog düzenlemede 'Sil' → 'Silmeyi onayla' var
# (contacts.delete / contacts.deleteConfirmAction). Eski hasta dialog'unda Sil yoktu.


async def run_test():
    pw = None
    browser = None
    context = None

    try:
        pw = await async_api.async_playwright().start()
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process",
            ],
        )
        context = await browser.new_context()
        context.set_default_timeout(15000)
        page = await context.new_page()

        await page.goto("http://app.localhost:5173")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass

        await page.locator('[id="email"]').wait_for(state="visible", timeout=10000)
        await page.locator('[id="email"]').fill("demo@verimaya.local")
        await page.locator('[id="password"]').fill("LocalDemo1!")
        await page.get_by_role("button", name="Giriş yap", exact=True).click(timeout=10000)

        await page.get_by_role("link", name="Kişiler", exact=True).click(timeout=10000)

        new_btn = page.get_by_role("button", name="Yeni kişi", exact=True)
        if await new_btn.count() == 0:
            new_btn = page.get_by_role("button", name="Yeni kişi ekle", exact=True)
        await new_btn.click(timeout=10000)
        await page.locator('[id="c-first-name"]').fill("Silinecek")
        await page.locator('[id="c-last-name"]').fill("Kisi TC014")
        await page.locator('[id="c-type"]').select_option(label="Hasta")
        await page.locator('[id="c-phone"]').fill("555014014")
        await page.locator('[id="c-source"]').select_option(label="Bilinmiyor")
        await page.get_by_role("button", name="Oluştur", exact=True).click(timeout=10000)
        await expect(page.get_by_role("heading", name="Silinecek Kisi TC014")).to_be_visible(
            timeout=15000
        )

        await page.get_by_role("button", name="Düzenle", exact=True).click(timeout=10000)
        await page.get_by_role("button", name="Sil", exact=True).click(timeout=10000)
        await expect(page.get_by_text("Aşağıdaki kişi listeden kaldırılacak:")).to_be_visible(
            timeout=10000
        )
        await page.get_by_role("button", name="Silmeyi onayla", exact=True).click(timeout=10000)

        # detail delete → goto /contacts
        await expect(page).to_have_url(re.compile(r"/contacts/?$"), timeout=15000)
        await expect(page.get_by_role("link", name="Silinecek Kisi TC014")).to_have_count(
            0, timeout=15000
        )

        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
