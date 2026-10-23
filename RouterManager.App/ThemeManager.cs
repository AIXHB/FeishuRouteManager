using System.Windows;
using System.Windows.Media;
using Microsoft.Win32;
namespace RouterManager.App;
public static class ThemeManager
{
 public static string Effective {get;private set;}="dark";
 public static void Apply(string choice)
 {
  var light=choice=="light";
  if(choice=="system")try{light=Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize","AppsUseLightTheme",0) is int n&&n!=0;}catch{light=false;}
  Effective=light?"light":"dark";
  var keys=new[]{"PageBg","CardBg","ControlBg","Ink","Muted","Line","HoverBg","SelectedBg","Accent","PrimaryBg","PrimaryText","Success","Warning"};
  var values=light?new[]{"#F5F5F5","#FFFFFF","#F1F1F1","#202020","#5C5C5C","#C8C8C8","#E7E7E7","#DFE9FC","#2556A6","#285CBD","#FFFFFF","#176B46","#885B08"}:new[]{"#141414","#1E1E1E","#262626","#EEEEEE","#AAAAAA","#424242","#333333","#313D50","#8DBAFF","#285CBD","#FFFFFF","#70D3A8","#F1C875"};
  for(var i=0;i<keys.Length;i++)Application.Current.Resources[keys[i]]=new SolidColorBrush((Color)ColorConverter.ConvertFromString(values[i]));
  Application.Current.Resources[SystemColors.HighlightBrushKey]=Application.Current.Resources["SelectedBg"];
  Application.Current.Resources[SystemColors.HighlightTextBrushKey]=Application.Current.Resources["Ink"];
  Application.Current.Resources[SystemColors.InactiveSelectionHighlightBrushKey]=Application.Current.Resources["SelectedBg"];
  Application.Current.Resources[SystemColors.InactiveSelectionHighlightTextBrushKey]=Application.Current.Resources["Ink"];
  Application.Current.Resources[SystemColors.ControlTextBrushKey]=Application.Current.Resources["Ink"];
  Application.Current.Resources[SystemColors.WindowTextBrushKey]=Application.Current.Resources["Ink"];
  Application.Current.Resources[SystemColors.GrayTextBrushKey]=Application.Current.Resources["Muted"];
 }
}
