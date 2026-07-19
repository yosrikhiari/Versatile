using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Versatile.Api.Common;

public class ResponseEnvelopeFilter : IResultFilter
{
    public void OnResultExecuting(ResultExecutingContext context)
    {
        if (context.Result is ObjectResult { Value: not null } objectResult
            && objectResult.StatusCode is >= 200 and < 300)
        {
            var value = objectResult.Value;
            var valueType = value.GetType();

            if (valueType.IsGenericType
                && valueType.GetGenericTypeDefinition() == typeof(ApiResponse<>))
                return;

            var envelopeType = typeof(ApiResponse<>).MakeGenericType(valueType);
            objectResult.Value = Activator.CreateInstance(envelopeType, value, null);
        }
    }

    public void OnResultExecuted(ResultExecutedContext context) { }
}
