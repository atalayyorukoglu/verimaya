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
        
        # -> Fill the E-posta field with 'demo@verimaya.local', the Şifre field with 'LocalDemo1!', then click the 'Giriş yap' button to submit the login form.
        # email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("demo@verimaya.local")
        
        # -> Fill the E-posta field with 'demo@verimaya.local', the Şifre field with 'LocalDemo1!', then click the 'Giriş yap' button to submit the login form.
        # password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("LocalDemo1!")
        
        # -> Fill the E-posta field with 'demo@verimaya.local', the Şifre field with 'LocalDemo1!', then click the 'Giriş yap' button to submit the login form.
        # Giriş yap button
        elem = page.get_by_role('button', name='Giriş yap', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Randevular' (Appointments) link in the left-side menu to open the Appointments/Schedule page.
        # Randevular link
        elem = page.get_by_text('Ana', exact=True).locator("xpath=ancestor-or-self::*[.//a][1]").get_by_role('link', name='Randevular', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Yeni randevu' button to open the new appointment form.
        # Yeni randevu button
        elem = page.get_by_role('button', name='Yeni randevu', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Oluştur' (Create) button to save the new appointment and then verify it appears in the schedule.
        # Oluştur button
        elem = page.get_by_role('button', name='Oluştur', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Verify the new appointment is displayed in the schedule
        # Assert: The calendar shows the new appointment 'Autotest Hasta 2026-08-09'.
        await expect(page.locator("xpath=/html/body/div[1]/div[1]/div/main/div/div[2]/section[7]/ul/li/button").nth(0)).to_contain_text("Autotest Hasta 2026-08-09", timeout=15000), "The calendar shows the new appointment 'Autotest Hasta 2026-08-09'."
        # Assert: The appointment appears in the operations list with the patient name 'Autotest Hasta 2026-08-09'.
        await expect(page.locator("xpath=/html/body/div[1]/div[1]/div/main/div/section/ul/li/header/div/div/a").nth(0)).to_have_text("Autotest Hasta 2026-08-09", timeout=15000), "The appointment appears in the operations list with the patient name 'Autotest Hasta 2026-08-09'."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    