import { expect, test } from "@playwright/test";

test("la ruta de confirmación informa cuando el enlace ya expiró", async ({ page }) => {
  await page.goto("/confirmar-correo?error=access_denied&error_code=otp_expired&type=signup");

  await expect(page.getByRole("heading", { name: "Revisa tu enlace" })).toBeVisible();
  await expect(page.getByText(/expiró o ya fue usado/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Volver al registro/ })).toHaveAttribute("href", "/registro");
});
