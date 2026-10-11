import type { Metadata } from "next";
import "./globals.css";
import "./detail-summary.css";

export const metadata: Metadata = {
  title: "钢舞姬战术档案库",
  description: "钢铁华尔兹测试服钢舞姬属性浏览、筛选与对比工具",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
