using System.IO;
using System.Text.RegularExpressions;

namespace Taharah.Core.Tests;

/// <summary>
/// חוזה משאבי העיצוב: בדיקה סטטית שקוראת את קובצי ה-XAML ומוודאת שכל מפתח
/// עיצוב שמשתמשים בו אכן קיים, ושאר שתי הערכות מגדירות בדיוק את אותם מפתחות.
/// </summary>
/// <remarks>
/// **למה סטטי ולא טעינת WPF בפועל:** נוסתה גרסה שטוענת את המסכים בפועל, והיא
/// אכן תפסה תקלות אמיתיות - אך יצירת <c>Application</c> בתהליך הבדיקות מזהמת
/// אותו לצמיתות: <c>ThemeService.Apply</c> מפסיק לקצר-דרך כשאין Application,
/// ומנסה לפתור URI יחסי שאינו קיים מחוץ לתוכנה הארוזה - מה שהפיל בדיקה קיימת
/// אחרת (<c>ToggleThemeAsync</c>). בדיקה סטטית מכסה את הסיכון האמיתי -
/// מפתח עיצוב חסר או אי-התאמה בין מצב יום למצב לילה - בלי לגעת במצב הגלובלי.
/// </remarks>
public class UIXamlResourceContractTests
{
    /// <summary>מפתחות שמסופקים על ידי ספריית WPF-UI (ThemesDictionary) ולא על ידינו.</summary>
    private static readonly HashSet<string> WpfUiProvidedKeys = new(StringComparer.Ordinal)
    {
        "ApplicationBackgroundBrush",
        "CardBackgroundFillColorDefaultBrush",
        "CardStrokeColorDefaultBrush",
        "ControlFillColorDefaultBrush",
        "TextFillColorPrimaryBrush"
    };

    private static readonly Regex KeyDefinitionRegex =
        new("x:Key=\"(?<key>[A-Za-z0-9_]+)\"", RegexOptions.Compiled);

    private static readonly Regex ResourceReferenceRegex =
        new("(?:StaticResource|DynamicResource)\\s+(?<key>[A-Za-z0-9_]+)", RegexOptions.Compiled);

    private static readonly Regex XmlCommentRegex =
        new("<!--.*?-->", RegexOptions.Compiled | RegexOptions.Singleline);

    /// <summary>קורא קובץ XAML בלי ההערות - בלעדי זה, הערה באנגלית שמזכירה
    /// "DynamicResource semantic token" הייתה נספרת כמפתח עיצוב שאינו קיים.</summary>
    private static string ReadXamlWithoutComments(string file) =>
        XmlCommentRegex.Replace(File.ReadAllText(file), string.Empty);

    /// <summary>מאתר את תיקיית פרויקט הממשק בלי להסתמך על עומק תיקיות bin/obj מקומי.</summary>
    private static string FindUiProjectDirectory()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            string candidate = Path.Combine(dir.FullName, "src", "Taharah.UI");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
            dir = dir.Parent;
        }

        throw new DirectoryNotFoundException(
            $"לא נמצאה תיקיית src/Taharah.UI החל מ-{AppContext.BaseDirectory}. הבדיקה תלויה בקובצי ה-XAML של פרויקט הממשק.");
    }

    private static string[] AllXamlFiles(string uiProjectDirectory) =>
        Directory.GetFiles(uiProjectDirectory, "*.xaml", SearchOption.AllDirectories)
            .Where(p => !p.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}"))
            .Where(p => !p.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}"))
            .ToArray();

    [Fact]
    public void EveryResourceKeyUsedInXaml_IsDefinedSomewhere()
    {
        string uiDir = FindUiProjectDirectory();
        string[] files = AllXamlFiles(uiDir);

        Assert.NotEmpty(files);

        var defined = new HashSet<string>(StringComparer.Ordinal);
        foreach (string file in files)
        {
            foreach (Match m in KeyDefinitionRegex.Matches(ReadXamlWithoutComments(file)))
            {
                defined.Add(m.Groups["key"].Value);
            }
        }

        var unresolved = new SortedSet<string>(StringComparer.Ordinal);
        foreach (string file in files)
        {
            foreach (Match m in ResourceReferenceRegex.Matches(ReadXamlWithoutComments(file)))
            {
                string key = m.Groups["key"].Value;
                if (!defined.Contains(key) && !WpfUiProvidedKeys.Contains(key))
                {
                    unresolved.Add($"{key} ({Path.GetFileName(file)})");
                }
            }
        }

        Assert.True(unresolved.Count == 0,
            "מפתחות עיצוב שנעשה בהם שימוש ואינם מוגדרים בשום XAML:" + Environment.NewLine +
            string.Join(Environment.NewLine, unresolved));
    }

    [Fact]
    public void LightAndDarkThemes_DefineExactlyTheSameKeys()
    {
        string uiDir = FindUiProjectDirectory();
        string themesDir = Path.Combine(uiDir, "Themes");

        var light = ExtractKeys(Path.Combine(themesDir, "LightTheme.xaml"));
        var dark = ExtractKeys(Path.Combine(themesDir, "DarkTheme.xaml"));

        Assert.NotEmpty(light);

        var missingInDark = light.Except(dark).OrderBy(k => k, StringComparer.Ordinal).ToList();
        var missingInLight = dark.Except(light).OrderBy(k => k, StringComparer.Ordinal).ToList();

        Assert.True(missingInDark.Count == 0,
            "טוקנים המוגדרים במצב יום וחסרים במצב לילה (המסך ייפול חזרה לצבע לא נכון בלילה):" +
            Environment.NewLine + string.Join(Environment.NewLine, missingInDark));

        Assert.True(missingInLight.Count == 0,
            "טוקנים המוגדרים במצב לילה וחסרים במצב יום:" +
            Environment.NewLine + string.Join(Environment.NewLine, missingInLight));
    }

    [Fact]
    public void Views_DoNotHardcodeColorsExceptAllowedShadow()
    {
        string uiDir = FindUiProjectDirectory();
        var hexPattern = new Regex("#[0-9A-Fa-f]{6,8}", RegexOptions.Compiled);

        var offenders = new List<string>();
        foreach (string file in AllXamlFiles(uiDir))
        {
            // קובצי הערכה הם המקום היחיד שבו מותר (וחייב) להיות hex - הם מגדירים את הטוקנים.
            if (file.Contains($"{Path.DirectorySeparatorChar}Themes{Path.DirectorySeparatorChar}"))
            {
                continue;
            }

            foreach (Match m in hexPattern.Matches(ReadXamlWithoutComments(file)))
            {
                offenders.Add($"{m.Value} ({Path.GetFileName(file)})");
            }
        }

        // DropShadowEffect צל שחור ב-PinLockOverlayView אינו צבע ממשק אלא צל,
        // ואינו אמור להתהפך עם הערכה.
        var unexpected = offenders.Where(o => !o.StartsWith("#000000")).ToList();

        Assert.True(unexpected.Count == 0,
            "צבעי hex קשיחים ב-XAML מחוץ לקבצי הטוקנים (לא יתהפכו במצב לילה):" +
            Environment.NewLine + string.Join(Environment.NewLine, unexpected));
    }

    private static HashSet<string> ExtractKeys(string file) =>
        KeyDefinitionRegex.Matches(ReadXamlWithoutComments(file))
            .Select(m => m.Groups["key"].Value)
            .ToHashSet(StringComparer.Ordinal);
}
