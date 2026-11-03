// Table audits select their workspace explicitly; the site's default is the
// square-portrait atlas. Do not make regression tests depend on menu order.
export async function openAttributeTable(page) {
  await page.getByRole("button", { name: "钢舞姬", exact: true }).click();
  await page.getByRole("menuitem", { name: /^属性表/ }).click();
  await page.locator(".table-archive").waitFor();
}
