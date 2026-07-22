using MediatR;
using Versatile.Application.DTOs;
using Versatile.Domain.Interfaces;

namespace Versatile.Application.SparkHistoryItems.Commands;

public record CreateSparkHistoryItemCommand(Guid StoryId, string Type, string? Prompt, string? Blueprint, string? GeneratedContent, Guid? OrganizationId, Guid UserId) : IRequest<SparkHistoryItemDto>, IRequiresOrganization;
