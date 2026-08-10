import asyncio
import os
import tempfile
from playwright import async_api
from playwright.async_api import expect

# GAP-F09-23: kişi detay Dosyalar panelinde aria-label='Dosyayı sil' + window.confirm.


async def run_test():
    pw = None
    browser = None
    context = None
    tmp_path = None

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
        await page.locator('[id="c-first-name"]').fill("Dosya")
        await page.locator('[id="c-last-name"]').fill("Test TC017")
        await page.locator('[id="c-type"]').select_option(label="Hasta")
        await page.locator('[id="c-source"]').select_option(label="Bilinmiyor")
        await page.get_by_role("button", name="Oluştur", exact=True).click(timeout=10000)
        await expect(page.get_by_role("heading", name="Dosya Test TC017")).to_be_visible(
            timeout=15000
        )

        await expect(page.get_by_role("heading", name="Dosyalar", exact=True)).to_be_visible()

        # Minimal geçerli 1x1 PNG (mime allowlist: png)
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
            b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        fd, tmp_path = tempfile.mkstemp(suffix="-tc017.png")
        os.write(fd, png_bytes)
        os.close(fd)

        file_input = page.locator('section:has(h2:text-is("Dosyalar")) input[type="file"]')
        await file_input.set_input_files(tmp_path)

        await expect(page.get_by_text(os.path.basename(tmp_path))).to_be_visible(timeout=20000)

        async with page.expect_dialog() as dialog_info:
            await page.get_by_role("button", name="Dosyayı sil", exact=True).click(timeout=10000)
        dialog = await dialog_info.value
        await dialog.accept()

        await expect(page.get_by_text(os.path.basename(tmp_path))).to_have_count(0, timeout=15000)
        await expect(page.get_by_text("Henüz dosya yok", exact=True)).to_be_visible(timeout=15000)

        await asyncio.sleep(5)

    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()


asyncio.run(run_test())
