using RouterManager.Core;
using System.Text.Json.Nodes;

var passed = 0;
void Check(bool ok, string name) { if (!ok) throw new Exception(name); Console.WriteLine("PASS " + name); passed++; }
var temp = Path.Combine(Path.GetTempPath(), "FeishuRouterManager.Tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(temp);
try
{
    Check(!Redactor.Clean("appSecret: abcdefghij").Contains("abcdefghij"), "named credentials hidden");
    Check(!Redactor.Clean("preview: ABCD1234ABCD1234ABCD1234ABCD1234").Contains("ABCD1234"), "credentials in previews hidden");
    var log = Path.Combine(temp, "tail.log"); File.WriteAllText(log, "一\n二\n三\n");
    Check(JsonFiles.Tail(log, 2).SequenceEqual(new[] { "二", "三" }), "bounded Unicode log tail");
    Directory.CreateDirectory(Path.Combine(temp, "registry"));
    Directory.CreateDirectory(Path.Combine(temp, "profiles", "one", "logs"));
    File.WriteAllText(Path.Combine(temp, "config.json"), """{"profiles":{"one":{"agentKind":"codex","accounts":{"app":{"id":"cli_test","secret":"NEVER_EXPOSE"}},"workspaces":{"default":"C:/work"},"permissions":{"defaultAccess":"workspace"}}}}""");
    File.WriteAllText(Path.Combine(temp, "registry", "processes.json"), """{"entries":[{"pid":42,"profileName":"one","botName":"测试机器人"}]}""");
    var eventLog = Path.Combine(temp, "profiles", "one", "logs", "bridge-20261020.jsonl");
    File.WriteAllText(eventLog, """
        {"ts":"2026-10-20T11:00:00+08:00","phase":"ws","event":"connected","bot":"测试机器人"}
        {"ts":"2026-10-20T11:00:01+08:00","phase":"run","event":"started"}
        partial-json
        """);
    var discovery = new BotDiscovery(temp);
    var tasks = new[] {new TaskSnapshot("LarkChannelBridge.Bot.one", "Running", "")};
    var bots = discovery.Discover(tasks, new HashSet<int>{42});
    Check(bots.Count == 1 && bots[0].Busy && bots[0].Connection == "已连接", "live bot and unfinished run discovered");
    Check(!System.Text.Json.JsonSerializer.Serialize(bots).Contains("NEVER_EXPOSE"), "discovery never exports app secret");
    Check(discovery.Discover(tasks, new HashSet<int>())[0].Pid is null, "stale registry cannot imply running");
    File.AppendAllText(eventLog, "\n{\"phase\":\"run\",\"event\":\"completed\"}\n");
    Check(!discovery.Discover(tasks, new HashSet<int>{42})[0].Busy, "completed run clears busy state");
    File.AppendAllText(eventLog, "{\"phase\":\"ws\",\"event\":\"reconnecting\"}\n");
    Check(discovery.Discover(tasks, new HashSet<int>{42})[0].Connection == "重连中", "disconnect not reported as connected");
    Check(new BotDiscovery(Path.Combine(temp,"missing")).Discover([],new HashSet<int>()).Count == 0, "unconfigured machine supported");
    File.WriteAllText(log,"{\"event\":\"message_start\",\"messageId\":\"a\"}\n{\"event\":\"message_start\",\"messageId\":\"b\"}\n{\"event\":\"message_done\",\"messageId\":\"a\"}\n");
    Check(BotDiscovery.IsPiBusy(log),"pi detects concurrent unfinished message");
    File.AppendAllText(log,"{\"event\":\"bridge_started\"}\n");
    Check(!BotDiscovery.IsPiBusy(log),"pi restart clears previous process pending state");
    Check(!new UserPreferences().QuotaEnabled,"quota polling is opt-in");
    var preferences=new UserPreferences{Theme="light",QuotaEnabled=true,QuotaIntervalMinutes=5,QuotaPi=false};preferences.Save(temp);
    Check(UserPreferences.Load(temp)==preferences,"theme and quota preferences persist");
    var invalid=false;try{(preferences with{QuotaIntervalMinutes=1}).Validate();}catch(ArgumentException){invalid=true;}
    Check(invalid,"quota interval validation prevents excessive polling");
    var schedule=new QuotaSchedule();var now=DateTimeOffset.UtcNow;
    Check(!schedule.TryBegin(new(),now),"disabled quota scheduler never begins");
    Check(schedule.TryBegin(preferences,now)&&!schedule.TryBegin(preferences,now),"quota scheduler prevents concurrent queries");
    schedule.Complete(preferences,now);
    Check(!schedule.TryBegin(preferences,now.AddMinutes(4))&&schedule.TryBegin(preferences,now.AddMinutes(5)),"quota scheduler respects configured interval");
    schedule.Complete(new(),now);Check(schedule.NextDue is null,"disabling scheduler clears next due");
    var a=new RouteLogEntry(now,"one","当当","codex","控制台","route.apply.started","info","apiKey: never-share-this");
    RouteLogs.Append(temp,a);
    var auditFile=Directory.GetFiles(Path.Combine(temp,"logs"),"router-*.jsonl").Single();
    Check(!File.ReadAllText(auditFile).Contains("never-share-this"),"audit log redacts sensitive operation data");
    var auditRows=RouteLogs.Read([new("console","控制台","unknown",auditFile,true)],now.AddMinutes(-1));
    Check(auditRows.Count==1&&auditRows[0].Bot=="当当"&&auditRows[0].Agent=="codex","audit logs retain robot and agent dimensions");
    Check(RouteLogs.Filter(auditRows,"one","pi",null,"").Count==0&&RouteLogs.Filter(auditRows,"one","codex","info","apply").Count==1,"route log robot/agent/level/search filters combine");
    File.WriteAllText(eventLog,"{\"ts\":\"2026-10-20T11:00:00Z\",\"phase\":\"intake\",\"event\":\"enter\"}\n{\"ts\":\"2026-10-20T11:00:01Z\",\"phase\":\"ws\",\"event\":\"connected\",\"agent\":\"Antigravity CLI (antigravity)\"}\n{\"ts\":\"2026-10-20T11:00:02Z\",\"phase\":\"intake\",\"event\":\"enter\"}\n{\"ts\":\"2026-10-20T11:00:03Z\",\"phase\":\"run\",\"event\":\"started\",\"agent\":\"codex\"}\n");
    var history=RouteLogs.Read([new("one","当当","unknown",eventLog)],DateTimeOffset.MinValue);
    Check(history.Count(h=>h.Agent=="unknown")==1&&history.Count(h=>h.Agent=="antigravity")==2&&history.Count(h=>h.Agent=="codex")==1,"historical route logs use recorded agent instead of current route");
    var skillSource=Path.Combine(temp,"skill-source");Directory.CreateDirectory(Path.Combine(skillSource,"references"));
    File.WriteAllText(Path.Combine(skillSource,"SKILL.md"),"---\nname: greeting\ndescription: A greeting skill\n---\nRead references/example.txt.\n");
    File.WriteAllText(Path.Combine(skillSource,"references/example.txt"),"original");
    var skillManager=Path.Combine(temp,"skill-manager");var skills=new BotSkills(skillManager);
    var installed=skills.Install("cli_one",skillSource);skills.Install("cli_two",skillSource);
    Check(installed.Id=="greeting"&&skills.List("cli_one").Single().Preview.Contains("A greeting skill"),"skill installs complete package and lists preview");
    File.WriteAllText(Path.Combine(skillSource,"references/example.txt"),"source changed");
    Check(File.ReadAllText(Path.Combine(installed.Path,"references/example.txt"))=="original","installed skill is a private copy instead of a source link");
    var rejected=false;try{skills.Install("cli_one",skillSource);}catch(InvalidOperationException){rejected=true;}
    Check(rejected&&skills.List("cli_one").Count==1,"duplicate skill rejected without overwriting");
    skills.Uninstall("cli_one","greeting");
    Check(skills.List("cli_one").Count==0&&skills.List("cli_two").Count==1&&File.Exists(Path.Combine(skillSource,"SKILL.md")),"skill uninstall leaves other bot and original source unchanged");
    Check(Directory.GetDirectories(Path.Combine(skillManager,"bots/cli_one/skill-archives")).Length==1,"uninstalled skill retained in bot archive");
    rejected=false;try{skills.Uninstall("cli_two","../greeting");}catch(ArgumentException){rejected=true;}
    Check(rejected&&skills.List("cli_two").Count==1,"skill uninstall refuses path traversal");
    rejected=false;try{skills.Root("../outside");}catch(ArgumentException){rejected=true;}
    Check(rejected,"skill storage rejects invalid bot identity");
    Directory.CreateDirectory(Path.Combine(skillSource,".agent"));
    rejected=false;try{skills.Install("cli_three",skillSource);}catch(ArgumentException){rejected=true;}
    Check(rejected&&skills.List("cli_three").Count==0&&!Directory.EnumerateDirectories(skills.Root("cli_three")).Any(),"failed skill copy with runtime data leaves no published or staging skill");
    Directory.Delete(Path.Combine(skillSource,".agent"));
    var linked=Path.Combine(skillSource,"linked");
    var linkInfo=new System.Diagnostics.ProcessStartInfo("node"){UseShellExecute=false,CreateNoWindow=true};
    linkInfo.ArgumentList.Add("-e");linkInfo.ArgumentList.Add("require('fs').symlinkSync(process.argv[1],process.argv[2],'junction')");linkInfo.ArgumentList.Add(skillManager);linkInfo.ArgumentList.Add(linked);
    using(var linkProcess=System.Diagnostics.Process.Start(linkInfo)!){linkProcess.WaitForExit();if(linkProcess.ExitCode!=0)throw new Exception("test junction creation failed");}
    rejected=false;try{skills.Install("cli_three",skillSource);}catch(IOException){rejected=true;}
    Check(rejected&&skills.List("cli_three").Count==0,"skill install refuses junctions and cannot copy another bot's runtime");
    Directory.Delete(linked);
    Console.WriteLine($"{passed} checks passed");
}
finally { Directory.Delete(temp, true); }
