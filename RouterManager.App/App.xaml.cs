using System.Windows;
namespace RouterManager.App;
public partial class App : Application
{
    private System.Threading.Mutex? instance;
    protected override void OnStartup(StartupEventArgs e) {
        if(!e.Args.Contains("--demo")&&!e.Args.Contains("--probe")) {
            instance=new System.Threading.Mutex(true,"Local\\FeishuRouterManager",out var first);
            if(!first){MessageBox.Show("飞书机器人路由控制台已经打开。请切回已有窗口。","应用已运行");Shutdown();return;}
        }
        base.OnStartup(e);
    }
    protected override void OnExit(ExitEventArgs e){instance?.Dispose();base.OnExit(e);}
}
