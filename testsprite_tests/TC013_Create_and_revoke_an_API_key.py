import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://app.localhost:5173")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill the 'E-posta' email field with demo@verimaya.local, fill the 'Şifre' password field with LocalDemo1!, then click the 'Giriş yap' button to sign in.
        # email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("demo@verimaya.local")
        
        # -> Fill the 'E-posta' email field with demo@verimaya.local, fill the 'Şifre' password field with LocalDemo1!, then click the 'Giriş yap' button to sign in.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("LocalDemo1!")
        
        # -> Fill the 'E-posta' email field with demo@verimaya.local, fill the 'Şifre' password field with LocalDemo1!, then click the 'Giriş yap' button to sign in.
        # Giriş yap button
        elem = page.get_by_role('button', name='Giriş yap', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Ayarlar' (Settings) link in the left navigation to open the Settings page.
        # Ayarlar link
        elem = page.get_by_role('link', name='Ayarlar', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'n8n / API' link under the 'Bağlantılar' section to open the API connections page.
        # n8n / API API anahtarları ve giden webhook’lar. link
        elem = page.get_by_role('link', name='n8n / API API anahtarları ve giden webhook’lar.', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Anahtar oluştur' button to open the API key creation dialog.
        # Anahtar oluştur button
        elem = page.get_by_role('button', name='Anahtar oluştur', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Ad' (Name) field with a test name and click the 'Oluştur' button to create the API key.
        # ör. n8n entegrasyonu text field
        elem = page.get_by_label('Ad', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("TC013 - n8n entegrasyonu")
        
        # -> Fill the 'Ad' (Name) field with a test name and click the 'Oluştur' button to create the API key.
        # Oluştur button
        elem = page.get_by_role('button', name='Oluştur', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Kapat' button to close the 'Anahtar oluşturuldu' dialog so the API keys list is visible.
        # Kapat button
        elem = page.locator('xpath=/html/body/div[2]/div[2]/div[2]/div/div[2]/button')
        await elem.click(timeout=10000)
        
        # -> Click the 'Anahtarı iptal et' (Revoke key) button for the 'TC013 - n8n entegrasyonu' API key to start revocation.
        # Anahtarı iptal et button
        elem = page.get_by_role('button', name='Anahtarı iptal et', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the updated API connection state is displayed
        # Assert: API keys panel displays 'Henüz aktif anahtar yok', confirming no active API keys.
        await expect(page.locator("xpath=/html/body/div/div[1]/div/main/div/div[2]/section[1]/div[2]/span").nth(0)).to_contain_text("Hen\u00fcz aktif anahtar yok", timeout=15000), "API keys panel displays 'Hen\u00fcz aktif anahtar yok', confirming no active API keys."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    