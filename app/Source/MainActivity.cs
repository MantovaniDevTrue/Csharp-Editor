using System;
using System.IO;
using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using Android.Provider;
using Android.Runtime;
using Android.Util;
using Android.Views;
using Android.Webkit;
using Java.Interop;
using Org.Json;

namespace BunnyStudio;

[Activity(Name = "io.github.mantovanidevtrue.bunnystudio.MainActivity", Label = "@string/app_name", MainLauncher = true, Exported = true, Theme = "@style/AppTheme",
    ConfigurationChanges = ConfigChanges.Orientation | ConfigChanges.ScreenSize | ConfigChanges.ScreenLayout |
        ConfigChanges.SmallestScreenSize | ConfigChanges.Keyboard | ConfigChanges.KeyboardHidden | ConfigChanges.UiMode,
    WindowSoftInputMode = SoftInput.AdjustResize)]
public class MainActivity : Activity
{
    private const string Tag = "BunnyStudio";
    private const string Origin = "https://appassets.androidplatform.net";
    private const int SaveRequest = 1, OpenRequest = 2, ConnectRequest = 3;
    private static bool rendererCrashed;

    private WebView web = null!;
    private CompilerHost compiler = null!;
    private BunnyBridge bunnyBridge = null!;
    private string? sdkIndexFile;
    private Android.Net.Uri? lastSavedPackage;
    private byte[]? pendingSave;
    private string pendingName = "";
    private IValueCallback? chooser;

    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        compiler = new CompilerHost(this, (id, result) => RunOnUiThread(() =>
            web.EvaluateJavascript($"window.bunnyStudio?.onNativeCompile({id},{JSONObject.Quote(result)})", null)));
        bunnyBridge = new BunnyBridge(this, (id, result) => RunOnUiThread(() =>
            web.EvaluateJavascript($"window.bunnyStudio?.onBridge({id},{JSONObject.Quote(result)})", null)));
        new System.Threading.Thread(PrepareSdkIndex) { IsBackground = true, Name = "BunnySdkIndex" }.Start();

        web = new WebView(this);
        SetContentView(web);
        WebSettings settings = web.Settings;
        settings.JavaScriptEnabled = true;
        settings.DomStorageEnabled = true;
        settings.AllowFileAccess = false;
        settings.AllowContentAccess = false;
        settings.TextZoom = 100;
        settings.SetSupportZoom(false);
        // Sem marcas de pagina: nada de brilho ao passar do limite nem barras de rolagem do WebView.
        web.OverScrollMode = OverScrollMode.Never;
        web.VerticalScrollBarEnabled = false;
        web.HorizontalScrollBarEnabled = false;
        web.SetBackgroundColor(Android.Graphics.Color.ParseColor("#0A1730"));
        web.AddJavascriptInterface(new NativeBridge(this), "BunnyAndroid");
        web.SetWebViewClient(new SiteClient(this));
        web.SetWebChromeClient(new Chrome(this));

        string? hash = rendererCrashed ? "rendercrash" : Intent?.GetStringExtra("bunny.hash");
        rendererCrashed = false;
        web.LoadUrl(Origin + "/site/index.html" + (hash != null ? "#" + hash : ""));
    }

#pragma warning disable CA1422, CS0672, CS0618
    public override void OnBackPressed()
    {
        web.EvaluateJavascript("window.bunnyStudio?.onBack() === true", new JsResult(handled =>
        {
            if (handled != "true") MoveTaskToBack(true);
        }));
    }
#pragma warning restore CA1422, CS0672, CS0618

    /// <summary>Gera, uma vez por versao do Bunny, o indice do autocomplete a partir da DLL dele.</summary>
    private void PrepareSdkIndex()
    {
        try
        {
            string? folder = BunnyPackage.ReferenceFolder(this);
            if (folder == null) return;
            string target = Path.Combine(CacheDir!.AbsolutePath, "sdk-" + Path.GetFileName(folder) + ".json");
            if (!File.Exists(target)) SdkIndex.Write(Path.Combine(folder, "BunnyLoader.dll"), target);
            sdkIndexFile = target;
            RunOnUiThread(() => web.EvaluateJavascript("window.bunnyStudio?.onSdkIndex()", null));
        }
        catch (Exception error)
        {
            Log.Error(Tag, "Indice do SDK falhou: " + error);
        }
    }

    protected override void OnActivityResult(int requestCode, [GeneratedEnum] Result resultCode, Intent? data)
    {
        base.OnActivityResult(requestCode, resultCode, data);
        if (requestCode == ConnectRequest)
        {
            bool accepted = false;
            try { accepted = resultCode == Result.Ok && bunnyBridge.Accept(data?.Data); }
            catch (Exception error) { Log.Error(Tag, "Falha ao conectar a pasta do Bunny: " + error); }
            web.EvaluateJavascript($"window.bunnyStudio?.onBunnyConnected({(accepted ? "true" : "false")})", null);
            return;
        }
        if (requestCode == SaveRequest)
        {
            string status = "cancelled";
            byte[]? bytes = pendingSave;
            pendingSave = null;
            if (resultCode == Result.Ok && data?.Data != null && bytes != null)
            {
                try
                {
                    using Stream? output = ContentResolver!.OpenOutputStream(data.Data);
                    output!.Write(bytes, 0, bytes.Length);
                    status = "saved";
                }
                catch (Exception error)
                {
                    Log.Error(Tag, "Falha ao salvar: " + error);
                    status = "failed";
                }
            }
            web.EvaluateJavascript($"window.bunnyStudio?.onNativeSave({JSONObject.Quote(status)},{JSONObject.Quote(pendingName)})", null);
        }
        else if (requestCode == OpenRequest)
        {
            var picked = new System.Collections.Generic.List<Android.Net.Uri>();
            if (resultCode == Result.Ok && data != null)
            {
                if (data.ClipData != null)
                    for (int i = 0; i < data.ClipData.ItemCount; i++) picked.Add(data.ClipData.GetItemAt(i)!.Uri!);
                else if (data.Data != null) picked.Add(data.Data);
            }
            chooser?.OnReceiveValue(picked.Count > 0 ? Java.Lang.Object.FromArray(picked.ToArray()) : null);
            chooser = null;
        }
    }

    protected override void OnDestroy()
    {
        web.Destroy();
        base.OnDestroy();
    }

    private void BeginSave(string filename, byte[] bytes)
    {
        pendingSave = bytes;
        pendingName = filename;
        var intent = new Intent(Intent.ActionCreateDocument);
        intent.AddCategory(Intent.CategoryOpenable);
        intent.SetType("application/octet-stream");
        intent.PutExtra(Intent.ExtraTitle, filename);
        StartActivityForResult(intent, SaveRequest);
    }

    private sealed class JsResult : Java.Lang.Object, IValueCallback
    {
        private readonly Action<string?> action;
        public JsResult(Action<string?> action) => this.action = action;
        public void OnReceiveValue(Java.Lang.Object? value) => action(value?.ToString());
    }

    /// <summary>Exposta so as paginas do proprio APK: nada externo e carregado no WebView.</summary>
    private sealed class NativeBridge : Java.Lang.Object
    {
        private readonly MainActivity activity;
        public NativeBridge(MainActivity activity) => this.activity = activity;

        [JavascriptInterface, Export("saveFile")]
        public void SaveFile(string filename, string base64)
        {
            byte[] bytes = Convert.FromBase64String(base64);
            activity.RunOnUiThread(() => activity.BeginSave(filename, bytes));
        }

        [JavascriptInterface, Export("saveToDownloads")]
        public string SaveToDownloads(string filename, string base64)
        {
            if (Build.VERSION.SdkInt < BuildVersionCodes.Q) return "unsupported";
            const string folder = "Download/BunnyStudio/";
            try
            {
                ContentResolver resolver = activity.ContentResolver!;
                // So apaga o que este app criou: trocar o arquivo evita "mod (1).bl", "mod (2).bl"...
                resolver.Delete(MediaStore.Downloads.ExternalContentUri!, "_display_name=? AND relative_path=?", new[] { filename, folder });
                var values = new ContentValues();
                values.Put("_display_name", filename);
                values.Put("mime_type", "application/octet-stream");
                values.Put("relative_path", folder);
                Android.Net.Uri uri = resolver.Insert(MediaStore.Downloads.ExternalContentUri!, values)
                    ?? throw new IOException("Downloads recusou o arquivo");
                byte[] bytes = Convert.FromBase64String(base64);
                using (Stream? output = resolver.OpenOutputStream(uri))
                    output!.Write(bytes, 0, bytes.Length);
                activity.lastSavedPackage = uri;
                return "saved:" + folder + filename;
            }
            catch (Exception error)
            {
                Log.Error(Tag, "Falha ao salvar em Downloads: " + error);
                return "failed:" + error.Message;
            }
        }

        private Intent? ImportIntent()
        {
            if (activity.lastSavedPackage == null) return null;
            foreach (string package in BunnyPackage.Packages)
            {
                var intent = new Intent(BunnyPackage.ImportAction);
                intent.SetDataAndType(activity.lastSavedPackage, "application/octet-stream");
                intent.SetPackage(package);
                intent.AddFlags(ActivityFlags.NewTask | ActivityFlags.ClearTop | ActivityFlags.SingleTop | ActivityFlags.GrantReadUriPermission);
                if (intent.ResolveActivity(activity.PackageManager!) != null) return intent;
            }
            return null;
        }

        [JavascriptInterface, Export("canSendToBunny")]
        public bool CanSendToBunny() => ImportIntent() != null;

        [JavascriptInterface, Export("sendToBunny")]
        public string SendToBunny()
        {
            Intent? intent = ImportIntent();
            if (intent == null) return OpenBunny() ? "opened" : "none";
            activity.StartActivity(intent);
            return "sent";
        }

        [JavascriptInterface, Export("openBunny")]
        public bool OpenBunny()
        {
            foreach (string package in BunnyPackage.Packages)
            {
                Intent? launch = activity.PackageManager!.GetLaunchIntentForPackage(package);
                if (launch == null) continue;
                activity.StartActivity(launch);
                return true;
            }
            return false;
        }

        [JavascriptInterface, Export("bridgeStatus")]
        public string BridgeStatus() => activity.bunnyBridge.StatusJson();

        [JavascriptInterface, Export("bridgeCall")]
        public void BridgeCall(int id, string op, string json) => activity.bunnyBridge.Enqueue(id, op, json);

        [JavascriptInterface, Export("connectBunny")]
        public void ConnectBunny() => activity.RunOnUiThread(() =>
        {
            try { activity.StartActivityForResult(activity.bunnyBridge.PickIntent(), ConnectRequest); }
            catch (Exception error)
            {
                Log.Error(Tag, "Falha ao abrir a conexao: " + error);
                activity.web.EvaluateJavascript("window.bunnyStudio?.onBunnyConnected(false)", null);
            }
        });

        [JavascriptInterface, Export("bunnyInfo")]
        public string BunnyInfo()
        {
            BunnyInstall? install = BunnyPackage.Find(activity);
            var info = new JSONObject();
            bool stub = BunnyPackage.HasTestApi(activity);
            info.Put("installed", install != null || stub);
            info.Put("stub", stub);
            info.Put("version", install?.Version ?? "");
            info.Put("package", install?.Package ?? "");
            return info.ToString();
        }

        [JavascriptInterface, Export("haptic")]
        public void Haptic(string kind)
        {
            FeedbackConstants feedback = kind switch
            {
                "long" => FeedbackConstants.LongPress,
                "confirm" => FeedbackConstants.ContextClick,
                _ => FeedbackConstants.VirtualKey,
            };
            activity.RunOnUiThread(() => activity.web.PerformHapticFeedback(feedback));
        }

        [JavascriptInterface, Export("compile")]
        public void Compile(int id, string json) => activity.compiler.Enqueue(id, json);
    }

    private sealed class SiteClient : WebViewClient
    {
        private readonly MainActivity activity;
        public SiteClient(MainActivity activity) => this.activity = activity;

        public override WebResourceResponse? ShouldInterceptRequest(WebView? view, IWebResourceRequest? request)
        {
            Android.Net.Uri? url = request?.Url;
            if (url == null || url.Host != "appassets.androidplatform.net") return null;
            string path = (url.Path ?? "").TrimStart('/');
            if (path == "api/sdk.json")
            {
                string? index = activity.sdkIndexFile;
                return index == null
                    ? new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new MemoryStream())
                    : new WebResourceResponse("application/json", "utf-8", File.OpenRead(index));
            }
            try
            {
                Stream data = activity.Assets!.Open(path);
                return new WebResourceResponse(MimeOf(path), "utf-8", data);
            }
            catch (Java.IO.IOException)
            {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new MemoryStream());
            }
        }

        private static string MimeOf(string path) => Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".html" => "text/html",
            ".js" => "text/javascript",
            ".json" => "application/json",
            ".woff2" => "font/woff2",
            ".png" => "image/png",
            _ => "application/octet-stream",
        };

        public override bool ShouldOverrideUrlLoading(WebView? view, IWebResourceRequest? request)
        {
            string target = request?.Url?.ToString() ?? "";
            if (target.StartsWith(Origin, StringComparison.Ordinal)) return false;
            try { activity.StartActivity(new Intent(Intent.ActionView, request!.Url)); }
            catch (ActivityNotFoundException) { }
            return true;
        }

        // Um mod pesado pode derrubar o renderizador; o projeto salvo volta na reabertura.
        public override bool OnRenderProcessGone(WebView? view, RenderProcessGoneDetail? detail)
        {
            Log.Error(Tag, "Renderizador encerrado, didCrash=" + detail?.DidCrash());
            rendererCrashed = true;
            activity.Recreate();
            return true;
        }
    }

    private sealed class Chrome : WebChromeClient
    {
        private readonly MainActivity activity;
        public Chrome(MainActivity activity) => this.activity = activity;

        public override bool OnConsoleMessage(ConsoleMessage? message)
        {
            Log.Info(Tag, message?.Message() ?? "");
            return true;
        }

        public override bool OnShowFileChooser(WebView? view, IValueCallback? callback, FileChooserParams? parameters)
        {
            activity.chooser?.OnReceiveValue(null);
            activity.chooser = callback;
            var intent = new Intent(Intent.ActionOpenDocument);
            intent.AddCategory(Intent.CategoryOpenable);
            intent.SetType("*/*");
            intent.PutExtra(Intent.ExtraAllowMultiple, true);
            activity.StartActivityForResult(intent, OpenRequest);
            return true;
        }
    }
}
