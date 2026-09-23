namespace Taharah.Core.Calendar;

/// <summary>
/// Precise Hebrew Date implementation matching hebcal/core standard used by the original application.
/// Provides absolute R.D. (Rata Die) day conversions, leap years, days in month, and month shifts across Rosh Hashanah.
/// </summary>
public sealed class HDate : IEquatable<HDate>, IComparable<HDate>
{
    private const int Epoch = -1373428;

    public const int Nisan = 1;
    public const int Iyyar = 2;
    public const int Sivan = 3;
    public const int Tamuz = 4;
    public const int Av = 5;
    public const int Elul = 6;
    public const int Tishrei = 7;
    public const int Cheshvan = 8;
    public const int Kislev = 9;
    public const int Tevet = 10;
    public const int Shvat = 11;
    public const int AdarI = 12;
    public const int AdarII = 13;

    private static readonly string[] MonthNamesHebrew =
    [
        "", "ניסן", "אייר", "סיון", "תמוז", "אב", "אלול",
        "תשרי", "חשון", "כסלו", "טבת", "שבט", "אדר", "אדר ב'"
    ];

    private static readonly string[] MonthNamesHebrewLeap =
    [
        "", "ניסן", "אייר", "סיון", "תמוז", "אב", "אלול",
        "תשרי", "חשון", "כסלו", "טבת", "שבט", "אדר א'", "אדר ב'"
    ];

    public int Day { get; }
    public int Month { get; }
    public int Year { get; }

    private int? _abs;

    public HDate(int day, int month, int year)
    {
        if (day < 1 || day > 30)
            throw new ArgumentOutOfRangeException(nameof(day), $"Day must be between 1 and 30, got {day}");
        if (month < 1 || month > 13)
            throw new ArgumentOutOfRangeException(nameof(month), $"Month must be between 1 and 13, got {month}");

        Day = day;
        Month = month;
        Year = year;
    }

    public HDate(int abs)
    {
        _abs = abs;
        var h = Abs2Hebrew(abs);
        Day = h.Day;
        Month = h.Month;
        Year = h.Year;
    }

    public int Abs()
    {
        _abs ??= Hebrew2Abs(Year, Month, Day);
        return _abs.Value;
    }

    public bool IsLeapYear => IsLeap(Year);

    public int DaysInMonth() => DaysInMonth(Month, Year);

    public int DayOfWeek => Math.Abs(Abs() % 7); // 0=Sunday, 6=Saturday

    public static bool IsLeap(int year) => (1 + year * 7) % 19 < 7;

    public static int MonthsInYear(int year) => 12 + (IsLeap(year) ? 1 : 0);

    public static int DaysInYear(int year) => ElapsedDays(year + 1) - ElapsedDays(year);

    public static bool LongCheshvan(int year) => DaysInYear(year) % 10 == 5;

    public static bool ShortKislev(int year) => DaysInYear(year) % 10 == 3;

    public static int DaysInMonth(int month, int year)
    {
        if (month == Iyyar || month == Tamuz || month == Elul || month == Tevet ||
            month == AdarII ||
            (month == AdarI && !IsLeap(year)) ||
            (month == Cheshvan && !LongCheshvan(year)) ||
            (month == Kislev && ShortKislev(year)))
        {
            return 29;
        }
        return 30;
    }

    public static int ElapsedDays(int year)
    {
        int prevYear = year - 1;
        int mElapsed = 235 * (prevYear / 19) +
                       12 * (prevYear % 19) +
                       ((prevYear % 19 * 7 + 1) / 19);

        int pElapsed = 204 + 793 * (mElapsed % 1080);
        int hElapsed = 5 + 12 * mElapsed + 793 * (mElapsed / 1080) + (pElapsed / 1080);
        int parts = (pElapsed % 1080) + 1080 * (hElapsed % 24);
        int day = 1 + 29 * mElapsed + (hElapsed / 24);

        int altDay = day + (parts >= 19440 ||
                            (day % 7 == 2 && parts >= 9924 && !IsLeap(year)) ||
                            (day % 7 == 1 && parts >= 16789 && IsLeap(prevYear)) ? 1 : 0);

        return altDay + (altDay % 7 == 0 || altDay % 7 == 3 || altDay % 7 == 5 ? 1 : 0);
    }

    public static int NewYearDelay(int year)
    {
        int ny1 = ElapsedDays(year);
        int ny2 = ElapsedDays(year + 1);

        if (ny2 - ny1 == 356) return 2;
        int ny0 = ElapsedDays(year - 1);
        return ny1 - ny0 == 382 ? 1 : 0;
    }

    public static int NewYear(int year)
    {
        return Epoch + ElapsedDays(year) + NewYearDelay(year);
    }

    public static int Hebrew2Abs(int year, int month, int day)
    {
        int tempabs = day;

        if (month < Tishrei)
        {
            for (int m = Tishrei; m <= MonthsInYear(year); m++)
            {
                tempabs += DaysInMonth(m, year);
            }
            for (int m = Nisan; m < month; m++)
            {
                tempabs += DaysInMonth(m, year);
            }
        }
        else
        {
            for (int m = Tishrei; m < month; m++)
            {
                tempabs += DaysInMonth(m, year);
            }
        }

        return Epoch + ElapsedDays(year) + tempabs - 1;
    }

    public static (int Year, int Month, int Day) Abs2Hebrew(int abs)
    {
        int approx = 1 + (int)Math.Floor((abs - Epoch) / 365.24682220597794);
        int year = approx - 1;

        while (NewYear(year) <= abs)
        {
            ++year;
        }
        --year;

        int month = abs < Hebrew2Abs(year, Nisan, 1) ? Tishrei : Nisan;

        while (abs > Hebrew2Abs(year, month, DaysInMonth(month, year)))
        {
            ++month;
        }

        int day = 1 + abs - Hebrew2Abs(year, month, 1);
        return (year, month, day);
    }

    public string GetMonthName()
    {
        var names = IsLeapYear ? MonthNamesHebrewLeap : MonthNamesHebrew;
        if (Month >= 1 && Month < names.Length)
            return names[Month];
        return Month.ToString();
    }

    public static string ToGematriya(int num)
    {
        if (num <= 0) return num.ToString();
        var tens = new[] { "", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ" };
        var units = new[] { "", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט" };

        if (num == 15) return "ט\"ו";
        if (num == 16) return "ט\"ז";

        if (num < 10)
        {
            return units[num] + "'";
        }

        if (num < 100)
        {
            int t = num / 10;
            int u = num % 10;
            if (u == 0) return tens[t] + "'";
            return tens[t] + "\"" + units[u];
        }

        return num.ToString();
    }

    public static string ToGematriyaYear(int year)
    {
        int rem = year % 1000;
        int hundreds = rem / 100;
        int tensUnits = rem % 100;

        string h = hundreds switch
        {
            1 => "ק",
            2 => "ר",
            3 => "ש",
            4 => "ת",
            5 => "תק",
            6 => "תר",
            7 => "תש",
            8 => "תת",
            9 => "תתק",
            _ => ""
        };

        if (tensUnits == 0) return h + "'";
        string tu = ToGematriya(tensUnits).TrimEnd('\'');
        if (tu.Contains('\"'))
        {
            return $"{h}{tu}";
        }
        return $"{h}\"{tu}";
    }

    public string RenderGematriya()
    {
        return $"{ToGematriya(Day)} {GetMonthName()} {ToGematriyaYear(Year)}";
    }

    public DateTime Greg()
    {
        return new DateTime(1, 1, 1).AddDays(Abs() - 1);
    }

    public string ToGematriyaString()
    {
        return RenderGematriya();
    }

    public override string ToString() => $"{Day} {GetMonthName()} {Year}";

    public bool Equals(HDate? other)
    {
        if (other is null) return false;
        return Year == other.Year && Month == other.Month && Day == other.Day;
    }

    public override bool Equals(object? obj) => Equals(obj as HDate);

    public override int GetHashCode() => HashCode.Combine(Year, Month, Day);

    public int CompareTo(HDate? other)
    {
        if (other is null) return 1;
        return Abs().CompareTo(other.Abs());
    }

    public static bool operator ==(HDate? left, HDate? right) => left?.Equals(right) ?? right is null;
    public static bool operator !=(HDate? left, HDate? right) => !(left == right);
    public static bool operator <(HDate left, HDate right) => left.CompareTo(right) < 0;
    public static bool operator >(HDate left, HDate right) => left.CompareTo(right) > 0;
    public static bool operator <=(HDate left, HDate right) => left.CompareTo(right) <= 0;
    public static bool operator >=(HDate left, HDate right) => left.CompareTo(right) >= 0;
}
