using System.Globalization;
using System.Windows.Data;
using Taharah.Core.Enums;

namespace Taharah.UI.Converters;

public class OnaTypeToHebrewConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture) =>
        value is OnaType.Night ? "לילה" : "יום";

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotImplementedException();
}
