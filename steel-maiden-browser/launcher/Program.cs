using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace SteelMaidenArchiveLauncher
{
    internal static class Program
    {
        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Length > 0 && string.Equals(args[0], "--self-test", StringComparison.OrdinalIgnoreCase))
            {
                string testRoot = LauncherForm.ResolveSiteRoot();
                if (testRoot == null) return 2;
                using (var testServer = new StaticFileServer(testRoot))
                {
                    testServer.Start();
                    using (var client = new WebClient())
                    {
                        string html = client.DownloadString("http://127.0.0.1:" + testServer.Port + "/");
                        string data = client.DownloadString("http://127.0.0.1:" + testServer.Port + "/data/maidens.json");
                        string research = client.DownloadString("http://127.0.0.1:" + testServer.Port + "/data/research-tree.json");
                        if (!html.Contains("_next/static")) return 3;
                        if (!data.Contains("\"rows\":[")) return 4;
                        if (!data.Contains("\"tank\":\"T39\"")) return 5;
                        if (!research.Contains("\"recipeCount\": 433") ||
                            !research.Contains("\"resourcePlanCount\": 598") ||
                            !research.Contains("\"equipmentGrade\": \"S6\"")) return 6;
                        return 0;
                    }
                }
            }

            bool createdNew;
            using (var mutex = new Mutex(true, "Local\\SteelMaidenArchivePortableLauncher", out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show("钢舞姬战术档案库已经在运行。", "已经启动", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new LauncherForm());
            }
            return 0;
        }
    }

    internal sealed class LauncherForm : Form
    {
        private readonly Label statusLabel;
        private readonly TextBox addressBox;
        private readonly Button openButton;
        private StaticFileServer server;
        private string address;

        public LauncherForm()
        {
            Text = "钢舞姬战术档案库";
            ClientSize = new Size(520, 205);
            MinimumSize = new Size(536, 244);
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(238, 241, 231);
            Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

            var title = new Label
            {
                AutoSize = true,
                Location = new Point(28, 24),
                Text = "钢舞姬战术档案库",
                Font = new Font("Microsoft YaHei UI", 17F, FontStyle.Bold, GraphicsUnit.Point),
                ForeColor = Color.FromArgb(16, 32, 25)
            };

            statusLabel = new Label
            {
                AutoSize = false,
                Location = new Point(30, 68),
                Size = new Size(460, 24),
                Text = "正在启动本地档案库……",
                ForeColor = Color.FromArgb(91, 105, 96)
            };

            addressBox = new TextBox
            {
                Location = new Point(30, 99),
                Size = new Size(460, 25),
                ReadOnly = true,
                BackColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };

            openButton = new Button
            {
                Location = new Point(286, 145),
                Size = new Size(98, 34),
                Text = "打开网页",
                Enabled = false,
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(213, 255, 101),
                ForeColor = Color.FromArgb(16, 32, 25)
            };
            openButton.FlatAppearance.BorderColor = Color.FromArgb(153, 184, 70);
            openButton.Click += delegate { OpenBrowser(); };

            var exitButton = new Button
            {
                Location = new Point(392, 145),
                Size = new Size(98, 34),
                Text = "退出",
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(16, 32, 25),
                ForeColor = Color.White
            };
            exitButton.FlatAppearance.BorderColor = Color.FromArgb(16, 32, 25);
            exitButton.Click += delegate { Close(); };

            Controls.Add(title);
            Controls.Add(statusLabel);
            Controls.Add(addressBox);
            Controls.Add(openButton);
            Controls.Add(exitButton);

            Shown += delegate { StartArchive(); };
            FormClosed += delegate { if (server != null) server.Dispose(); };
        }

        private void StartArchive()
        {
            try
            {
                string root = ResolveSiteRoot();
                if (root == null)
                {
                    throw new DirectoryNotFoundException("没有找到 site 文件夹，请确认已完整解压压缩包后再启动。");
                }

                server = new StaticFileServer(root);
                server.Start();
                address = "http://127.0.0.1:" + server.Port + "/";
                addressBox.Text = address;
                statusLabel.Text = "已启动。关闭此窗口即可停止本地服务。";
                openButton.Enabled = true;
                OpenBrowser();
            }
            catch (Exception error)
            {
                statusLabel.Text = "启动失败";
                MessageBox.Show(error.Message, "无法启动", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        internal static string ResolveSiteRoot()
        {
            string baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
            string portableSite = Path.Combine(baseDirectory, "site");
            if (File.Exists(Path.Combine(portableSite, "index.html"))) return portableSite;

            string developmentSite = Path.Combine(baseDirectory, "steel-maiden-browser", "dist", "client");
            if (File.Exists(Path.Combine(developmentSite, "index.html"))) return developmentSite;
            return null;
        }

        private void OpenBrowser()
        {
            if (string.IsNullOrEmpty(address)) return;
            try
            {
                Process.Start(new ProcessStartInfo(address) { UseShellExecute = true });
            }
            catch
            {
                Process.Start("explorer.exe", address);
            }
        }
    }

    internal sealed class StaticFileServer : IDisposable
    {
        private readonly string root;
        private readonly string rootPrefix;
        private TcpListener listener;
        private Thread acceptThread;
        private volatile bool running;

        public int Port { get; private set; }

        public StaticFileServer(string rootDirectory)
        {
            root = Path.GetFullPath(rootDirectory);
            rootPrefix = root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        }

        public void Start()
        {
            listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            Port = ((IPEndPoint)listener.LocalEndpoint).Port;
            running = true;
            acceptThread = new Thread(AcceptLoop) { IsBackground = true, Name = "SteelMaidenArchiveServer" };
            acceptThread.Start();
        }

        private void AcceptLoop()
        {
            while (running)
            {
                try
                {
                    TcpClient client = listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(delegate { HandleClient(client); });
                }
                catch (SocketException) { if (running) Thread.Sleep(50); }
                catch (ObjectDisposedException) { break; }
            }
        }

        private void HandleClient(TcpClient client)
        {
            using (client)
            {
                client.ReceiveTimeout = 10000;
                client.SendTimeout = 30000;
                NetworkStream stream = client.GetStream();
                try
                {
                    var reader = new StreamReader(stream, Encoding.ASCII, false, 4096, true);
                    string requestLine = reader.ReadLine();
                    if (string.IsNullOrEmpty(requestLine)) return;
                    string header;
                    do { header = reader.ReadLine(); } while (!string.IsNullOrEmpty(header));

                    string[] parts = requestLine.Split(' ');
                    if (parts.Length < 2 || (parts[0] != "GET" && parts[0] != "HEAD"))
                    {
                        SendError(stream, 405, "Method Not Allowed");
                        return;
                    }

                    string rawPath = parts[1].Split('?')[0];
                    string decodedPath = Uri.UnescapeDataString(rawPath).Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
                    if (string.IsNullOrEmpty(decodedPath)) decodedPath = "index.html";
                    string fullPath = Path.GetFullPath(Path.Combine(root, decodedPath));
                    if (!fullPath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
                    {
                        SendError(stream, 404, "Not Found");
                        return;
                    }

                    var fileInfo = new FileInfo(fullPath);
                    string cache = fullPath.EndsWith("index.html", StringComparison.OrdinalIgnoreCase) || fullPath.EndsWith(".json", StringComparison.OrdinalIgnoreCase)
                        ? "no-cache"
                        : "public, max-age=31536000, immutable";
                    string responseHeaders = "HTTP/1.1 200 OK\r\n" +
                                             "Content-Type: " + ContentType(fullPath) + "\r\n" +
                                             "Content-Length: " + fileInfo.Length + "\r\n" +
                                             "Cache-Control: " + cache + "\r\n" +
                                             "X-Content-Type-Options: nosniff\r\n" +
                                             "Connection: close\r\n\r\n";
                    byte[] headerBytes = Encoding.ASCII.GetBytes(responseHeaders);
                    stream.Write(headerBytes, 0, headerBytes.Length);
                    if (parts[0] == "HEAD") return;

                    using (FileStream file = File.OpenRead(fullPath)) file.CopyTo(stream, 64 * 1024);
                }
                catch (IOException) { }
                catch (Exception)
                {
                    try { SendError(stream, 500, "Internal Server Error"); } catch { }
                }
            }
        }

        private static void SendError(Stream stream, int code, string message)
        {
            byte[] body = Encoding.UTF8.GetBytes(code + " " + message);
            string headers = "HTTP/1.1 " + code + " " + message + "\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\n\r\n";
            byte[] headerBytes = Encoding.ASCII.GetBytes(headers);
            stream.Write(headerBytes, 0, headerBytes.Length);
            stream.Write(body, 0, body.Length);
        }

        private static string ContentType(string path)
        {
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".js": return "text/javascript; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".webp": return "image/webp";
                case ".png": return "image/png";
                case ".jpg":
                case ".jpeg": return "image/jpeg";
                case ".svg": return "image/svg+xml";
                case ".ico": return "image/x-icon";
                case ".woff2": return "font/woff2";
                default: return "application/octet-stream";
            }
        }

        public void Dispose()
        {
            running = false;
            if (listener != null) listener.Stop();
        }
    }
}
