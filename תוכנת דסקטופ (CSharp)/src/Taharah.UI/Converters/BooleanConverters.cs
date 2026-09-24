using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace Taharah.UI.Converters;

public class BoolToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        bool b = false;
        if (value is bool flag)
        {
            b = flag;
        }
        else if (value is int count)
        {
            b = count > 0;
        }
        else if (value is string str)
        {
            b = !string.IsNullOrWhiteSpace(str);
        }
        else if (value != null)
        {
            b = true;
        }

        if (Invert) b = !b;
        return b ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is Visibility vis)
        {
            bool result = vis == Visibility.Visible;
            return Invert ? !result : result;
        }
        if (value is bool b)
        {
            return Invert ? !b : b;
        }
        return false;
    }
}

/// <summary>Visible when the bound string equals the ConverterParameter (case-sensitive) - used for one-of-N option panels (e.g. showing the "discreet prefix" field only when Discretion == "discreet").</summary>
public class StringEqualsToVisibilityConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        bool equal = value is string s && parameter is string p && s == p;
        return equal ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotSupportedException();
    }
}

